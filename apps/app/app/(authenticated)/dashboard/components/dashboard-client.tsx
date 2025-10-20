"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@repo/design-system/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/design-system/components/ui/card";
import { GithubIcon, Linkedin, SparklesIcon, Loader2 } from "lucide-react";
import { useSubscription } from '@repo/auth/hooks/use-subscription';
import type { SubscriptionTier } from '@repo/auth/client';
import Link from 'next/link';

// ===== CONSTANTS & CONFIGURATION =====
const CLIENT_IDS = {
  google: process.env.NEXT_PUBLIC_AUTH0_GOOGLE_CLIENT_ID,
  spotify: process.env.NEXT_PUBLIC_AUTH0_SPOTIFY_CLIENT_ID,
  discord: process.env.NEXT_PUBLIC_AUTH0_DISCORD_CLIENT_ID,
  github: process.env.NEXT_PUBLIC_AUTH0_GITHUB_CLIENT_ID,
  linkedin: process.env.NEXT_PUBLIC_AUTH0_LINKEDIN_CLIENT_ID,
};

const BASE_SCOPES = {
  google: "openid profile email offline_access https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/spreadsheets",
  spotify: "openid user-read-email user-read-private user-read-playback-state user-library-read offline_access",
  discord: "openid identify email guilds offline_access",
  github: "openid user:email repo read:user offline_access",
  linkedin: "openid r_liteprofile r_emailaddress w_member_social offline_access",
};

// Feature gating configuration
const TIER_FEATURES = {
  FREE: ['google', 'github'],
  PRO: ['google', 'github', 'spotify', 'discord'],
  BUSINESS: ['google', 'github', 'spotify', 'discord', 'linkedin'],
};

// ===== INTERFACES =====
interface N8NStatusData {
  n8n_ready: boolean;
  n8n_url?: string;
  project_status?: string;
  injected_providers_count?: number;
  social_providers_count?: number;
}

interface SocialCredential {
  id: string;
  provider: string;
  injectedToN8n: boolean;
  injectedAt?: Date;
  injectionError?: string;
  createdAt: Date;
}

interface OverviewStatsProps {
  activeConnections: number;
  apiCalls: number;
  currentTier: SubscriptionTier;
}

interface ServiceButtonProps {
  service: "google" | "spotify" | "discord" | "github" | "linkedin";
  label: string;
  icon: React.ReactNode;
  userId: string | null;
  isLocked: boolean;
  isFree: boolean;
}

interface DashboardClientProps {
  userId: string | null;
  userEmail: string | null;
  initialTier: SubscriptionTier;
}

// ===== UTILITY FUNCTIONS =====
const createOAuthState = (userId: string, service: string): string => {
  return btoa(JSON.stringify({
    user_id: userId,
    service: service,
    timestamp: Date.now(),
  }));
};

const buildAuthorizationUrl = (service: keyof typeof CLIENT_IDS, state: string): string => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_IDS[service]!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth-callback`,
    scope: BASE_SCOPES[service],
    state: state,
    connection: service === 'google' ? 'google-oauth2' : service
  });

  if (service === 'google') {
    params.append('access_type', 'offline');
    params.append('prompt', 'consent');
  }

  if (service === 'spotify') {
    params.append('show_dialog', 'true');
  }

  return `https://${process.env.NEXT_PUBLIC_AUTH0_DOMAIN}/authorize?${params.toString()}`;
};

const clearUrlParams = (paramsToRemove: string[]): void => {
  const url = new URL(window.location.href);
  paramsToRemove.forEach(param => url.searchParams.delete(param));
  window.history.replaceState({}, '', url.toString());
};

const isFeatureAvailable = (service: string, tier: SubscriptionTier): boolean => {
  return TIER_FEATURES[tier]?.includes(service) || false;
};

// ===== ICON COMPONENTS =====
const GoogleIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const DiscordIcon = () => (
  <svg className="h-4 w-4" fill="#5865F2" viewBox="0 0 24 24">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
  </svg>
);

const SpotifyIcon = () => (
  <svg className="h-4 w-4" fill="#1DB954" viewBox="0 0 24 24">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
);

const LinkedInIcon = () => (
  <svg className="h-4 w-4" fill="#0A66C2" viewBox="0 0 24 24">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

// ===== OVERVIEW STATS COMPONENT =====
function OverviewStats({ activeConnections, apiCalls, currentTier }: OverviewStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Connections</CardTitle>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            className="h-4 w-4 text-muted-foreground"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{activeConnections}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">API Calls</CardTitle>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            className="h-4 w-4 text-muted-foreground"
          >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{apiCalls}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Current Plan</CardTitle>
          <SparklesIcon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{currentTier}</div>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== SERVICE BUTTON COMPONENT =====
function ServiceButton({ service, label, icon, userId, isLocked, isFree }: ServiceButtonProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = () => {
    if (!userId || (isLocked && isFree)) return;

    setIsConnecting(true);
    const state = createOAuthState(userId, service);
    const authUrl = buildAuthorizationUrl(service, state);

    console.log('🔗 Initiating OAuth flow:', { service });
    window.location.href = authUrl;
  };

  if (isLocked && isFree) {
    return (
      <Button
        disabled
        className="flex items-center justify-center gap-2 text-sm font-bold h-full w-full px-0 py-0 border border-gray-200 rounded-lg bg-gray-50 cursor-not-allowed"
        variant="ghost"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          className="h-4 w-4"
        >
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        {label} (Locked)
      </Button>
    );
  }

  return (
    <Button
      onClick={handleConnect}
      disabled={isConnecting || !userId}
      className="flex items-center justify-center gap-2 text-sm font-bold h-full w-full px-0 py-0 border border-gray-200 rounded-lg hover:border-gray-300"
      variant="ghost"
    >
      {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {isConnecting ? "Connecting..." : `Connect ${label}`}
    </Button>
  );
}

// ===== INTEGRATIONS SECTION =====
function IntegrationsSection({ userId, tier, isFree }: { userId: string | null; tier: SubscriptionTier; isFree: boolean }) {
  const services = [
    { service: "google" as const, label: "Google", icon: <GoogleIcon /> },
    { service: "github" as const, label: "GitHub", icon: <GithubIcon className="h-4 w-4" /> },
    { service: "spotify" as const, label: "Spotify", icon: <SpotifyIcon /> },
    { service: "discord" as const, label: "Discord", icon: <DiscordIcon /> },
    { service: "linkedin" as const, label: "LinkedIn", icon: <LinkedInIcon /> },
  ];

  const availableServices = services.filter(s => isFeatureAvailable(s.service, tier));
  const lockedServices = services.filter(s => !isFeatureAvailable(s.service, tier));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Integrations</h3>
          <p className="text-sm text-muted-foreground">Connect and manage your service integrations</p>
        </div>

        <div className="border-b border-gray-200 mb-4">
          <div className="flex space-x-4">
            <button className="pb-2 border-b-2 border-blue-500 text-sm font-medium">
              Available ({availableServices.length})
            </button>
            {lockedServices.length > 0 && (
              <button className="pb-2 text-sm font-medium text-gray-500">
                Locked ({lockedServices.length})
              </button>
            )}
          </div>
        </div>

        {/* Available Services */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 mb-6">
          {availableServices.map(({ service, label, icon }) => (
            <Card key={service} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center justify-center h-24">
                <ServiceButton
                  service={service}
                  label={label}
                  icon={icon}
                  userId={userId}
                  isLocked={false}
                  isFree={isFree}
                />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Locked Services */}
        {lockedServices.length > 0 && (
          <>
            <h4 className="text-sm font-medium text-gray-500 mb-3">Upgrade to unlock</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {lockedServices.map(({ service, label, icon }) => (
                <Card key={service} className="border-0 shadow-sm opacity-60">
                  <CardContent className="p-4 flex items-center justify-center h-24">
                    <ServiceButton
                      service={service}
                      label={label}
                      icon={icon}
                      userId={userId}
                      isLocked={true}
                      isFree={isFree}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ===== RECENT ACTIVITY COMPONENT =====
function RecentActivity({ userId }: { userId: string | null }) {
  const [connections, setConnections] = useState<SocialCredential[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConnections = async () => {
      if (!userId) return;

      try {
        const response = await fetch(`/api/user/social-credentials?userId=${userId}`);
        if (response.ok) {
          const data = await response.json();
          setConnections(data);
        }
      } catch (error) {
        console.error('Error fetching connections:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConnections();
  }, [userId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center space-x-3">
                <div className="rounded-full bg-gray-200 h-8 w-8"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-2 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (connections.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            No connections yet. Connect a service to get started!
          </p>
        </CardContent>
      </Card>
    );
  }

  const getConnectionStatus = (connection: SocialCredential) => {
    if (connection.injectedToN8n) {
      const date = connection.injectedAt ? new Date(connection.injectedAt).toLocaleDateString() : 'Unknown';
      return { color: 'bg-green-500', text: `Connected ${date}`, icon: '✓' };
    }
    if (connection.injectionError) return { color: 'bg-red-500', text: 'Failed', icon: '✕' };
    return { color: 'bg-yellow-500', text: 'Pending...', icon: '○' };
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {connections.slice(0, 5).map((conn) => {
            const status = getConnectionStatus(conn);
            return (
              <div
                key={conn.id}
                className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0"
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${status.color}`}></div>
                  <div>
                    <p className="font-medium capitalize">{conn.provider}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(conn.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {conn.injectionError && (
                    <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded">
                      Error
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500">
                  {status.text}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ===== NOTIFICATION COMPONENT =====
interface NotificationProps {
  message: string;
  onDismiss: () => void;
}

const Notification = ({ message, onDismiss }: NotificationProps) => {
  const isSuccess = message.includes("✅");
  const borderColor = isSuccess ? "border-green-500" : "border-red-500";
  const bgColor = isSuccess ? "bg-green-50" : "bg-red-50";
  const textColor = isSuccess ? "text-green-700" : "text-red-700";

  return (
    <div className={`p-4 rounded-lg border ${borderColor} ${bgColor} ${textColor}`}>
      <p className="text-sm">{message}</p>
      <button
        onClick={onDismiss}
        className="float-right text-xs underline hover:no-underline"
      >
        Dismiss
      </button>
    </div>
  );
};

// ===== MAIN DASHBOARD COMPONENT =====
export function DashboardClient({ userId, userEmail, initialTier }: DashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("");
  const { tier, isFree } = useSubscription();
  const [stats, setStats] = useState({ activeConnections: 0, apiCalls: 0 });

  // Use initialTier as fallback if subscription hook fails
  const currentTier = tier || initialTier;

  useEffect(() => {
    const connected = searchParams.get("connected");
    const status = searchParams.get("status");
    const error = searchParams.get("error");

    if (connected && status === "success") {
      setMessage(
        `✅ Successfully connected ${connected}! Your credentials are now available in N8N.`
      );
      clearUrlParams(['connected', 'status', 'timestamp']);
      setTimeout(() => setMessage(""), 5000);
    } else if (error) {
      setMessage(`❌ Connection failed: ${decodeURIComponent(error)}`);
      clearUrlParams(['error', 'timestamp']);
      setTimeout(() => setMessage(""), 8000);
    }
  }, [searchParams]);

  // Fetch stats
  useEffect(() => {
    const fetchStats = async () => {
      if (!userId) return;

      try {
        const [n8nResponse, credentialsResponse] = await Promise.all([
          fetch(`/api/user/n8n-status?userId=${userId}`),
          fetch(`/api/user/social-credentials?userId=${userId}`)
        ]);

        if (n8nResponse.ok && credentialsResponse.ok) {
          const n8nData = await n8nResponse.json();
          const credData = await credentialsResponse.json();

          setStats({
            activeConnections: n8nData.injected_providers_count || 0,
            apiCalls: credData.length * 10, // Mock API calls based on connections
          });
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };

    fetchStats();
  }, [userId]);

  return (
    <div className="space-y-6">
      {/* Upgrade Banner */}
      {isFree && (
        <div className="rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 p-4 dark:border-blue-800 dark:from-blue-950 dark:to-cyan-950">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                <SparklesIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold">Upgrade to unlock more integrations</h3>
                <p className="text-sm text-muted-foreground">
                  Get access to Slack, Airtable, Notion and more with Pro plan
                </p>
              </div>
            </div>
            <Button asChild>
              <Link href="/pricing">
                <SparklesIcon className="mr-2 h-4 w-4" />
                View Plans
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Notification */}
      {message && (
        <Notification
          message={message}
          onDismiss={() => setMessage("")}
        />
      )}

      {/* Overview Stats */}
      <OverviewStats 
        activeConnections={stats.activeConnections}
        apiCalls={stats.apiCalls}
        currentTier={currentTier}
      />

      {/* Integrations */}
      <IntegrationsSection 
        userId={userId}
        tier={currentTier}
        isFree={isFree}
      />

      {/* Recent Activity */}
      <RecentActivity userId={userId} />
    </div>
  );
}
