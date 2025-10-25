"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";

interface DeploymentStatusScreenProps {
  userId: string;
  userEmail: string;
  projectStatus: string;
}

export function DeploymentStatusScreen({ 
  userId, 
  userEmail, 
  projectStatus: initialStatus 
}: DeploymentStatusScreenProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [timeRemaining, setTimeRemaining] = useState(111);
  const [progress, setProgress] = useState(0);
  const [n8nUrl, setN8nUrl] = useState<string | null>(null);

  // Poll deployment status
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/user/n8n-status?userId=${userId}`);
        if (response.ok) {
          const data = await response.json();
          
          if (data.northflank_project_status === 'ready' && data.n8n_url) {
            setStatus('ready');
            setN8nUrl(data.n8n_url);
            clearInterval(pollInterval);
            
            // Redirect after 3 seconds
            setTimeout(() => {
              router.push('/dashboard');
            }, 3000);
          } else if (data.northflank_project_status === 'failed') {
            setStatus('failed');
            clearInterval(pollInterval);
          } else {
            setStatus(data.northflank_project_status || 'deploying');
          }
        }
      } catch (error) {
        console.error('Failed to fetch deployment status:', error);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [userId, router]);

  // Countdown timer
  useEffect(() => {
    if (status === 'ready' || status === 'failed') return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 0) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status]);

  // Progress animation
  useEffect(() => {
    if (status === 'ready') {
      setProgress(100);
      return;
    }

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return prev;
        const increment = Math.random() * 2;
        return Math.min(prev + increment, 95);
      });
    }, 1000);

    return () => clearInterval(progressInterval);
  }, [status]);

  const circumference = 2 * Math.PI * 120;
  const strokeDashoffset = circumference - (timeRemaining / 111) * circumference;

  const getStatusMessage = () => {
    switch (status) {
      case 'ready':
        return '✅ Your N8N workspace is ready!';
      case 'failed':
        return '❌ Deployment failed. Please contact support.';
      case 'deploying':
        return '🚀 Setting up your N8N workspace...';
      default:
        return '⏳ Initializing deployment...';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'ready':
        return 'text-green-500';
      case 'failed':
        return 'text-red-500';
      default:
        return 'text-blue-500';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        {/* Main Card */}
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl shadow-2xl p-12 border border-slate-200/50 dark:border-slate-700/50">
          {/* Logo with Circular Timer */}
          <div className="relative w-64 h-64 mx-auto mb-8">
            {/* Circular Progress */}
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 256 256">
              {/* Background Circle */}
              <circle
                cx="128"
                cy="128"
                r="120"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-slate-200 dark:text-slate-700"
              />
              
              {/* Progress Circle */}
              <circle
                cx="128"
                cy="128"
                r="120"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeDasharray={circumference}
                strokeDashoffset={status === 'ready' ? 0 : strokeDashoffset}
                strokeLinecap="round"
                className={`transition-all duration-1000 ${
                  status === 'ready' 
                    ? 'text-green-500' 
                    : status === 'failed' 
                    ? 'text-red-500' 
                    : 'text-blue-500'
                }`}
              />
            </svg>

            {/* Logo in Center */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative">
                <img
                  src="/main-icon.svg"
                  alt="Logo"
                  className="w-32 h-32 object-contain"
                />
                
                {/* Status Icon Overlay */}
                {status === 'ready' && (
                  <div className="absolute -bottom-2 -right-2 bg-green-500 rounded-full p-2 shadow-lg animate-bounce">
                    <CheckCircle2 className="w-6 h-6 text-white" />
                  </div>
                )}
                
                {status === 'failed' && (
                  <div className="absolute -bottom-2 -right-2 bg-red-500 rounded-full p-2 shadow-lg">
                    <AlertCircle className="w-6 h-6 text-white" />
                  </div>
                )}
                
                {status !== 'ready' && status !== 'failed' && (
                  <div className="absolute -bottom-2 -right-2 bg-blue-500 rounded-full p-2 shadow-lg">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                )}
              </div>
            </div>

            {/* Timer Display */}
            {status !== 'ready' && status !== 'failed' && (
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-center">
                <div className="text-4xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Estimated time remaining
                </div>
              </div>
            )}
          </div>

          {/* Status Message */}
          <div className="text-center mt-16 mb-8">
            <h1 className={`text-3xl font-bold mb-3 ${getStatusColor()}`}>
              {getStatusMessage()}
            </h1>
            
            {status === 'ready' && n8nUrl && (
              <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                  Your N8N workspace URL:
                </p>
                <a 
                  href={n8nUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-sm break-all"
                >
                  {n8nUrl}
                </a>
              </div>
            )}

            {status !== 'ready' && status !== 'failed' && (
              <p className="text-slate-600 dark:text-slate-400">
                We're configuring your workspace with N8N automation tools. 
                This usually takes about 2 minutes.
              </p>
            )}
          </div>

          {/* Progress Bar */}
          {status !== 'ready' && status !== 'failed' && (
            <div className="mb-8">
              <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Initializing...</span>
                <span>{Math.round(progress)}%</span>
              </div>
            </div>
          )}

          {/* Deployment Steps */}
          {status !== 'ready' && status !== 'failed' && (
            <div className="space-y-3">
              <DeploymentStep 
                label="Creating project infrastructure" 
                isActive={progress >= 0}
                isComplete={progress >= 25}
              />
              <DeploymentStep 
                label="Deploying N8N service" 
                isActive={progress >= 25}
                isComplete={progress >= 50}
              />
              <DeploymentStep 
                label="Configuring database" 
                isActive={progress >= 50}
                isComplete={progress >= 75}
              />
              <DeploymentStep 
                label="Finalizing setup" 
                isActive={progress >= 75}
                isComplete={progress >= 95}
              />
            </div>
          )}

          {/* Ready State Actions */}
          {status === 'ready' && (
            <div className="text-center mt-8">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Redirecting to dashboard in 3 seconds...
              </p>
              <button
                onClick={() => router.push('/dashboard')}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
              >
                Go to Dashboard Now
              </button>
            </div>
          )}

          {/* Failed State Actions */}
          {status === 'failed' && (
            <div className="text-center mt-8 space-y-4">
              <p className="text-slate-600 dark:text-slate-400">
                Something went wrong during deployment. Our team has been notified.
              </p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => window.location.reload()}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
                >
                  Retry Deployment
                </button>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="px-6 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white rounded-xl font-medium transition-colors"
                >
                  Skip to Dashboard
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="text-center mt-6 text-sm text-slate-500 dark:text-slate-400">
          <p>Setting up your workspace for <strong>{userEmail}</strong></p>
        </div>
      </div>
    </div>
  );
}

interface DeploymentStepProps {
  label: string;
  isActive: boolean;
  isComplete: boolean;
}

function DeploymentStep({ label, isActive, isComplete }: DeploymentStepProps) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
        isComplete 
          ? 'bg-green-500 text-white' 
          : isActive 
          ? 'bg-blue-500 text-white' 
          : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
      }`}>
        {isComplete ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : isActive ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <div className="w-2 h-2 rounded-full bg-current" />
        )}
      </div>
      <span className={`transition-colors ${
        isComplete 
          ? 'text-green-600 dark:text-green-400 font-medium' 
          : isActive 
          ? 'text-slate-900 dark:text-white font-medium' 
          : 'text-slate-500 dark:text-slate-400'
      }`}>
        {label}
      </span>
    </div>
  );
}