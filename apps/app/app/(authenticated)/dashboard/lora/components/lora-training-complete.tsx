import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/design-system/components/ui/card";
import { Button } from "@repo/design-system/components/ui/button";
import { Alert, AlertDescription } from "@repo/design-system/components/ui/alert";
import { Progress } from "@repo/design-system/components/ui/progress";
import { Loader2, Sparkles, AlertCircle, CheckCircle2, Clock, Zap, Database, TrendingUp, Shield, Brain, RefreshCw } from "lucide-react";

export function LoraTrainingComplete({ user }: any) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [training, setTraining] = useState(false);
  const [progress, setProgress] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      if (status?.status === 'training') {
        fetchStatus();
        setProgress(prev => Math.min(prev + 2, 95));
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [status?.status]);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/lora/train');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        if (data.status === 'completed') setProgress(100);
        else if (data.status === 'training') setProgress(prev => Math.max(prev, 10));
      }
    } catch (error) {
      console.error('Failed to fetch status:', error);
    } finally {
      setLoading(false);
    }
  };

  const syncCounts = async () => {
    try {
      setSyncing(true);
      const response = await fetch('/api/lora/sync-counts', { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        window.location.reload();
      } else {
        alert(`❌ ${data.error}`);
      }
    } catch (error) {
      alert(`Failed: ${(error as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const startTraining = async () => {
    if (!confirm('Start LoRA fine-tuning?\n\nEstimated time: 10-30 minutes')) return;
    try {
      setTraining(true);
      setProgress(5);
      const response = await fetch('/api/lora/train', { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        setProgress(10);
        await fetchStatus();
        alert(`✅ Training started!\n\nVersion: ${data.adapterVersion}`);
      } else {
        alert(`❌ ${data.error}`);
      }
    } catch (error) {
      alert(`Failed: ${(error as Error).message}`);
    } finally {
      setTraining(false);
    }
  };

  const totalData = user.goodChannelCount + user.badChannelCount + user.mclChainCount;
  const canTrain = user.postgresSchemaInitialized && totalData >= 10;
  const isTraining = status?.status === 'training' || user.loraTrainingStatus === 'training';

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Zap className="h-8 w-8 text-yellow-500" />
          LoRA Fine-Tuning
        </h1>
        <p className="text-muted-foreground mt-2">Personalize your AI model</p>
      </div>

      {!user.postgresSchemaInitialized && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Database setup required</AlertDescription>
        </Alert>
      )}

      <Card className={isTraining ? 'border-blue-500' : status?.status === 'completed' ? 'border-green-500' : status?.status === 'failed' ? 'border-red-500' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isTraining && <Loader2 className="h-5 w-5 animate-spin text-blue-500" />}
            {status?.status === 'completed' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
            {status?.status === 'failed' && <AlertCircle className="h-5 w-5 text-red-500" />}
            Training Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="text-lg font-semibold capitalize">{status?.status || user.loraTrainingStatus || 'idle'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Version</p>
                <p className="text-lg font-semibold">{status?.currentVersion || user.loraAdapterVersion || 'None'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last Trained</p>
                <p className="text-sm">{status?.lastTrainedAt || user.loraLastTrainedAt ? new Date(status?.lastTrainedAt || user.loraLastTrainedAt!).toLocaleString() : 'Never'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Dataset Size</p>
                <p className="text-lg font-semibold">{status?.stats?.total || totalData}</p>
              </div>
            </div>

            {isTraining && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-semibold">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">🧠 Training... 10-30 minutes</p>
              </div>
            )}

            {(status?.error || user.loraTrainingError) && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{status?.error || user.loraTrainingError}</AlertDescription>
              </Alert>
            )}

            {status?.status === 'completed' && (
              <Alert className="border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-600">✅ Training completed!</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-500" />
              Training Data
            </div>
            <Button onClick={syncCounts} disabled={syncing} variant="outline" size="sm">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Sync</span>
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/10 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium">Good Channel</p>
                  <p className="text-xs text-muted-foreground">Positive interactions</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-green-600">{status?.stats?.goodChannel || user.goodChannelCount}</p>
                <p className="text-xs text-muted-foreground">samples</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/10 rounded-lg">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-orange-600" />
                <div>
                  <p className="font-medium">Bad Channel (Safety)</p>
                  <p className="text-xs text-muted-foreground">With counterfactuals</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-orange-600">{status?.stats?.badChannel || user.badChannelCount}</p>
                <p className="text-xs text-muted-foreground">samples</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/10 rounded-lg">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="font-medium">Moral Context Layer</p>
                  <p className="text-xs text-muted-foreground">Reasoning chains</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-purple-600">{status?.stats?.mclChains || user.mclChainCount}</p>
                <p className="text-xs text-muted-foreground">chains</p>
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Total</p>
                <p className="text-3xl font-bold">{status?.stats?.total || totalData}</p>
              </div>
              {totalData < 10 && (
                <p className="text-xs text-red-600 mt-2">⚠️ Need 10+ samples (current: {totalData})</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            How It Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-xs font-bold">1</div>
              <div>
                <p className="font-medium">Data Collection & Approval</p>
                <p className="text-muted-foreground">Auto-approves high-quality conversations</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-xs font-bold">2</div>
              <div>
                <p className="font-medium">LoRA Training</p>
                <p className="text-muted-foreground">Creates lightweight adapter (~10MB)</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-xs font-bold">3</div>
              <div>
                <p className="font-medium">Automatic Deployment</p>
                <p className="text-muted-foreground">Loaded into Ollama for personalized responses</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-medium">Ready to Train?</p>
              <p className="text-sm text-muted-foreground">
                {canTrain ? 'Data ready' : totalData < 10 ? `Need ${10 - totalData} more` : 'Complete setup first'}
              </p>
            </div>
            <Button onClick={startTraining} disabled={!canTrain || training || isTraining || loading} size="lg" className="w-full sm:w-auto">
              {training || isTraining ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Training...</> : <><Zap className="h-4 w-4 mr-2" />Start Training</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Technical Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div><p className="text-muted-foreground">Base Model</p><p className="font-semibold">Mistral 7B</p></div>
            <div><p className="text-muted-foreground">LoRA Rank</p><p className="font-semibold">r=8</p></div>
            <div><p className="text-muted-foreground">Training Time</p><p className="font-semibold">10-30 min</p></div>
            <div><p className="text-muted-foreground">Adapter Size</p><p className="font-semibold">~10MB</p></div>
            <div><p className="text-muted-foreground">Data Mixing</p><p className="font-semibold">40% good / 30% safe / 30% MCL</p></div>
            <div><p className="text-muted-foreground">Infrastructure</p><p className="font-semibold">Northflank Jobs</p></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default LoraTrainingComplete;