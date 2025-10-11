import { env } from '@/env';
import { analytics } from '@repo/analytics/posthog/server';
import { clerkClient } from '@repo/auth/server';
import { database } from '@repo/database';
import { parseError } from '@repo/observability/error';
import { log } from '@repo/observability/log';
import { stripe } from '@repo/payments';
import type { Stripe } from '@repo/payments';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

// ============================================
// HELPER FUNCTIONS
// ============================================

const getUserFromCustomerId = async (customerId: string) => {
  const clerk = await clerkClient();
  const users = await clerk.users.getUserList();

  const user = users.data.find(
    (user) => user.privateMetadata.stripeCustomerId === customerId
  );

  return user;
};

const getTierFromPriceId = (priceId: string): 'FREE' | 'PRO' => {
  // Pro Plan Price ID
  if (priceId === 'price_1Ric5JDLk0PkB2fKhSmA0GoO') {
    return 'PRO';
  }
  return 'FREE';
};

// ============================================
// SUBSCRIPTION HANDLERS
// ============================================

const handleCustomerSubscriptionCreated = async (
  subscription: Stripe.Subscription
) => {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  const priceId = subscription.items.data[0]?.price.id;
  const productId =
    typeof subscription.items.data[0]?.price.product === 'string'
      ? subscription.items.data[0].price.product
      : subscription.items.data[0]?.price.product.id;

  if (!priceId || !productId) {
    log.error('Missing price or product ID in subscription');
    return;
  }

  const tier = getTierFromPriceId(priceId);

  // Find or create user in database
  let user = await database.user.findUnique({
    where: { stripeCustomerId: customerId },
  });

  // If user not found by customerId, try to find by Clerk
  if (!user) {
    const clerkUser = await getUserFromCustomerId(customerId);
    if (clerkUser) {
      user = await database.user.upsert({
        where: { clerkId: clerkUser.id },
        create: {
          clerkId: clerkUser.id,
          email: clerkUser.emailAddresses[0]?.emailAddress || '',
          stripeCustomerId: customerId,
          subscriptionTier: tier,
        },
        update: {
          stripeCustomerId: customerId,
          subscriptionTier: tier,
        },
      });
    }
  }

  if (!user) {
    log.error('User not found for customer', { customerId });
    return;
  }

  // Create subscription record
  await database.subscription.create({
    data: {
      userId: user.id,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      stripeProductId: productId,
      stripeCustomerId: customerId,
      status: subscription.status.toUpperCase() as any,
      tier,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      trialStart: subscription.trial_start
        ? new Date(subscription.trial_start * 1000)
        : null,
      trialEnd: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
    },
  });

  // Update user tier
  await database.user.update({
    where: { id: user.id },
    data: { subscriptionTier: tier },
  });

  // Update Clerk metadata
  const clerkUser = await getUserFromCustomerId(customerId);
  if (clerkUser) {
    const clerk = await clerkClient();
    await clerk.users.updateUser(clerkUser.id, {
      publicMetadata: {
        ...clerkUser.publicMetadata,
        subscription: {
          tier,
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end,
        },
      },
    });

    analytics.capture({
      event: 'Subscription Created',
      distinctId: clerkUser.id,
      properties: {
        tier,
        priceId,
        subscriptionId: subscription.id,
      },
    });
  }

  log.info('Subscription created', { subscriptionId: subscription.id, tier });
};

const handleCustomerSubscriptionUpdated = async (
  subscription: Stripe.Subscription
) => {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  const priceId = subscription.items.data[0]?.price.id;
  const tier = getTierFromPriceId(priceId || '');

  // Update subscription in database
  const existingSubscription = await database.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
    include: { user: true },
  });

  if (!existingSubscription) {
    log.warn('Subscription not found, creating...', {
      subscriptionId: subscription.id,
    });
    await handleCustomerSubscriptionCreated(subscription);
    return;
  }

  await database.subscription.update({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: subscription.status.toUpperCase() as any,
      tier,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : null,
    },
  });

  // Update user tier
  await database.user.update({
    where: { id: existingSubscription.userId },
    data: { subscriptionTier: tier },
  });

  // Update Clerk metadata
  const clerkUser = await getUserFromCustomerId(customerId);
  if (clerkUser) {
    const clerk = await clerkClient();
    await clerk.users.updateUser(clerkUser.id, {
      publicMetadata: {
        ...clerkUser.publicMetadata,
        subscription: {
          tier,
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end,
        },
      },
    });

    analytics.capture({
      event: 'Subscription Updated',
      distinctId: clerkUser.id,
      properties: {
        tier,
        status: subscription.status,
      },
    });
  }

  log.info('Subscription updated', { subscriptionId: subscription.id, tier });
};

const handleCustomerSubscriptionDeleted = async (
  subscription: Stripe.Subscription
) => {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  // Update subscription status
  const existingSubscription = await database.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (existingSubscription) {
    await database.subscription.update({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
      },
    });

    // Downgrade to FREE tier
    await database.user.update({
      where: { id: existingSubscription.userId },
      data: { subscriptionTier: 'FREE' },
    });
  }

  // Update Clerk metadata
  const clerkUser = await getUserFromCustomerId(customerId);
  if (clerkUser) {
    const clerk = await clerkClient();
    await clerk.users.updateUser(clerkUser.id, {
      publicMetadata: {
        ...clerkUser.publicMetadata,
        subscription: {
          tier: 'FREE',
          status: 'canceled',
          currentPeriodEnd: null,
        },
      },
    });

    analytics.capture({
      event: 'Subscription Deleted',
      distinctId: clerkUser.id,
    });
  }

  log.info('Subscription deleted', { subscriptionId: subscription.id });
};

// ============================================
// CHECKOUT HANDLERS
// ============================================

const handleCheckoutSessionCompleted = async (
  session: Stripe.Checkout.Session
) => {
  if (!session.customer) {
    return;
  }

  const customerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer.id;

  const clerkUser = await getUserFromCustomerId(customerId);

  if (!clerkUser) {
    log.error('User not found for customer', { customerId });
    return;
  }

  // Ensure user exists in database
  await database.user.upsert({
    where: { clerkId: clerkUser.id },
    create: {
      clerkId: clerkUser.id,
      email: clerkUser.emailAddresses[0]?.emailAddress || '',
      stripeCustomerId: customerId,
    },
    update: {
      stripeCustomerId: customerId,
    },
  });

  analytics.capture({
    event: 'Checkout Completed',
    distinctId: clerkUser.id,
    properties: {
      sessionId: session.id,
      amount: session.amount_total,
    },
  });

  log.info('Checkout completed', { sessionId: session.id });
};

// ============================================
// INVOICE HANDLERS
// ============================================

const handleInvoicePaymentSucceeded = async (invoice: Stripe.Invoice) => {
  if (!invoice.customer || !invoice.subscription) {
    return;
  }

  const customerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer.id;

  const clerkUser = await getUserFromCustomerId(customerId);

  if (clerkUser) {
    analytics.capture({
      event: 'Payment Succeeded',
      distinctId: clerkUser.id,
      properties: {
        amount: invoice.amount_paid,
        invoiceId: invoice.id,
      },
    });
  }

  log.info('Invoice payment succeeded', { invoiceId: invoice.id });
};

const handleInvoicePaymentFailed = async (invoice: Stripe.Invoice) => {
  if (!invoice.customer) {
    return;
  }

  const customerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer.id;

  const clerkUser = await getUserFromCustomerId(customerId);

  if (clerkUser) {
    analytics.capture({
      event: 'Payment Failed',
      distinctId: clerkUser.id,
      properties: {
        invoiceId: invoice.id,
        attemptCount: invoice.attempt_count,
      },
    });
  }

  log.warn('Invoice payment failed', { invoiceId: invoice.id });
};

// ============================================
// MAIN WEBHOOK HANDLER
// ============================================

export const POST = async (request: Request): Promise<Response> => {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ message: 'Not configured', ok: false });
  }

  try {
    const body = await request.text();
    const headerPayload = await headers();
    const signature = headerPayload.get('stripe-signature');

    if (!signature) {
      throw new Error('missing stripe-signature header');
    }

    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );

    log.info('Stripe webhook received', { type: event.type });

    switch (event.type) {
      // Subscription Events
      case 'customer.subscription.created': {
        await handleCustomerSubscriptionCreated(event.data.object);
        break;
      }
      case 'customer.subscription.updated': {
        await handleCustomerSubscriptionUpdated(event.data.object);
        break;
      }
      case 'customer.subscription.deleted': {
        await handleCustomerSubscriptionDeleted(event.data.object);
        break;
      }

      // Checkout Events
      case 'checkout.session.completed': {
        await handleCheckoutSessionCompleted(event.data.object);
        break;
      }

      // Invoice Events
      case 'invoice.payment_succeeded': {
        await handleInvoicePaymentSucceeded(event.data.object);
        break;
      }
      case 'invoice.payment_failed': {
        await handleInvoicePaymentFailed(event.data.object);
        break;
      }

      // Legacy Events (keep for backwards compatibility)
      case 'subscription_schedule.canceled': {
        log.info('Legacy subscription_schedule.canceled event received');
        break;
      }

      default: {
        log.warn(`Unhandled event type ${event.type}`);
      }
    }

    await analytics.shutdown();

    return NextResponse.json({ result: event, ok: true });
  } catch (error) {
    const message = parseError(error);

    log.error('Webhook error:', message);

    return NextResponse.json(
      {
        message: 'something went wrong',
        ok: false,
      },
      { status: 500 }
    );
  }
};