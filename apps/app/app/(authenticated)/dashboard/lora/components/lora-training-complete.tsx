// apps/app/app/(authenticated)/dashboard/lora/components/lora-training-complete.tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/design-system/components/ui/card";
import { Button } from "@repo/design-system/components/ui/button";
import { Alert, AlertDescription } from "@repo/design-system/components/ui/alert";
import { Progress } from "@repo/design-system/components/ui/progress";
import { 
  Loader2, Sparkles, AlertCircle, CheckCircle2, 
  Clock, Zap, Database, TrendingUp, Shield, Brain 
} from "lucide-react";

interface TrainingStatus {
  status: string;
  currentVersion: string | null;
  lastTrainedAt: string | null;
  error: string | null;
  latestJob: {
    id: string;
    status: string;
    startedAt: string;
  } | null;
  stats: {
    goodChannel: number;
    badChannel: number;
    mclChains: number;
    total: number;
  };
}

interface User {
  postgresSchemaInitialized: boolean;
  loraTrainingStatus: string | null;
  loraAdapterVersion: string | null;
  loraLastTrainedAt: Date | null;
  loraTrainingError: string | null;
  goodChannelCount: number;
  badChannelCount: number;
  mclChainCount: number;
}

export function LoraTrainingComplete({ user }: { user: User }) {
  const [status, setStatus] = useState<TrainingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [training, setTraining] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    fetchStatus();
    
    // Poll if training
    const interval = setInterval(() => {
      if (status?.status === 'training') {
        fetchStatus();
        // Simulate progress
        setProgress(prev => Math.min(prev + 2, 95));
      }
    }, 30000); // Every 30s

    return () => clearInterval(interval);
  }, [status?.status]);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/lora/train');
      
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        
        if (data.status === 'completed') {
          setProgress(100);
        } else if (data.status === 'training') {
          setProgress(prev => Math.max(prev, 10));
        }
      }
    } catch (error) {
      console.error('Failed to fetch status:', error);
    } finally {
      setLoading(false);
    }
  };

  const startTraining = async () => {
    if (!confirm('Start LoRA fine-tuning? This will train a personalized model using your conversation data.\n\nEstimated time: 10-30 minutes')) {
      return;
    }

    try {
      setTraining(true);
      setProgress(5);
      
      const response = await fetch('/api/lora/train', {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        setProgress(10);
        await fetchStatus();
        alert(`✅ Training started!\n\nVersion: ${data.adapterVersion}\nEstimated time: ${data.estimatedTime}\n\nYou can close this page and come back later.`);
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      alert(`Failed to start training: ${(error as Error).message}`);
    } finally {
      setTraining(false);
    }
  };

  // Check if ready to train
  const totalData = user.goodChannelCount + user.badChannelCount + user.mclChainCount;
  const canTrain = user.postgresSchemaInitialized && totalData >= 10;
  const isTraining = status?.status === 'training' || user.loraTrainingStatus === 'training';

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Zap className="h-8 w-8 text-yellow-500" />
          LoRA Fine-Tuning
        </h1>
        <p className="text-muted-foreground mt-2">
          Personalize your AI model with your conversation patterns
        </p>
      </div>

      {/* Prerequisites Check */}
      {!user.postgresSchemaInitialized && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Database setup required. Please set up your database first from the dashboard.
          </AlertDescription>
        </Alert>
      )}

      {/* Training Status Card */}
      <Card className={
        isTraining ? 'border-blue-500 shadow-lg' :
        status?.status === 'completed' ? 'border-green-500' :
        status?.status === 'failed' ? 'border-red-500' :
        ''
      }>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isTraining && (
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            )}
            {status?.status === 'completed' && (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            )}
            {status?.status === 'failed' && (
              <AlertCircle className="h-5 w-5 text-red-500" />
            )}
            Training Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Status Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="text-lg font-semibold capitalize">
                  {status?.status || user.loraTrainingStatus || 'idle'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Version</p>
                <p className="text-lg font-semibold">
                  {status?.currentVersion || user.loraAdapterVersion || 'None'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last Trained</p>
                <p className="text-sm">
                  {status?.lastTrainedAt || user.loraLastTrainedAt
                    ? new Date(status?.lastTrainedAt || user.loraLastTrainedAt!).toLocaleString()
                    : 'Never'
                  }
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Dataset Size</p>
                <p className="text-lg font-semibold">
                  {status?.stats?.total || totalData}
                </p>
              </div>
            </div>

            {/* Progress Bar (if training) */}
            {isTraining && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Training Progress</span>
                  <span className="font-semibold">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">
                  🧠 Fine-tuning model... This may take 10-30 minutes
                </p>
              </div>
            )}

            {/* Error */}
            {(status?.error || user.loraTrainingError) && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {status?.error || user.loraTrainingError}
                </AlertDescription>
              </Alert>
            )}

            {/* Success Message */}
            {status?.status === 'completed' && (
              <Alert className="border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-600 dark:text-green-400">
                  ✅ Training completed! Your personalized model is ready to use.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Data Composition Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-500" />
            Training Data Composition
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Good Channel */}
            <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/10 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium">Good Channel</p>
                  <p className="text-xs text-muted-foreground">Positive interactions</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-green-600">
                  {status?.stats?.goodChannel || user.goodChannelCount}
                </p>
                <p className="text-xs text-muted-foreground">samples</p>
              </div>
            </div>

            {/* Bad Channel */}
            <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/10 rounded-lg">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-orange-600" />
                <div>
                  <p className="font-medium">Bad Channel (Safety)</p>
                  <p className="text-xs text-muted-foreground">With safe counterfactuals</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-orange-600">
                  {status?.stats?.badChannel || user.badChannelCount}
                </p>
                <p className="text-xs text-muted-foreground">samples</p>
              </div>
            </div>

            {/* MCL Chains */}
            <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/10 rounded-lg">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="font-medium">Moral Context Layer</p>
                  <p className="text-xs text-muted-foreground">Complex reasoning chains</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-purple-600">
                  {status?.stats?.mclChains || user.mclChainCount}
                </p>
                <p className="text-xs text-muted-foreground">chains</p>
              </div>
            </div>

            {/* Total */}
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Total Training Data</p>
                <p className="text-3xl font-bold">
                  {status?.stats?.total || totalData}
                </p>
              </div>
              {totalData < 10 && (
                <p className="text-xs text-red-600 mt-2">
                  ⚠️ Need at least 10 samples to start training (current: {totalData})
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            How LoRA Fine-Tuning Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-xs font-bold">
                1
              </div>
              <div>
                <p className="font-medium">Data Collection & Approval</p>
                <p className="text-muted-foreground">
                  System automatically approves high-quality conversations and safe counterfactuals
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-xs font-bold">
                2
              </div>
              <div>
                <p className="font-medium">LoRA Training</p>
                <p className="text-muted-foreground">
                  Creates a lightweight adapter (~10MB) without modifying the base model
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-xs font-bold">
                3
              </div>
              <div>
                <p className="font-medium">Automatic Deployment</p>
                <p className="text-muted-foreground">
                  Adapter is loaded into Ollama and ready for personalized responses
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Button */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-medium">Ready to Train?</p>
              <p className="text-sm text-muted-foreground">
                {canTrain 
                  ? 'Your data is ready for training'
                  : totalData < 10
                  ? `Collect ${10 - totalData} more samples to start training`
                  : 'Complete database setup first'
                }
              </p>
            </div>
            <Button
              onClick={startTraining}
              disabled={!canTrain || training || isTraining || loading}
              size="lg"
              className="w-full sm:w-auto"
            >
              {training || isTraining ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Training...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Start Training
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Technical Details */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Technical Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-muted-foreground">Base Model</p>
              <p className="font-semibold">Mistral 7B</p>
            </div>
            <div>
              <p className="text-muted-foreground">LoRA Rank</p>
              <p className="font-semibold">r=8</p>
            </div>
            <div>
              <p className="text-muted-foreground">Training Time</p>
              <p className="font-semibold">10-30 min</p>
            </div>
            <div>
              <p className="text-muted-foreground">Adapter Size</p>
              <p className="font-semibold">~10MB</p>
            </div>
            <div>
              <p className="text-muted-foreground">Data Mixing</p>
              <p className="font-semibold">40% good / 30% safe / 30% MCL</p>
            </div>
            <div>
              <p className="text-muted-foreground">Infrastructure</p>
              <p className="font-semibold">Northflank Jobs</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}