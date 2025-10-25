"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { GL } from "@/components/gl";

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
  const [progress, setProgress] = useState(0);
  const [hovering, setHovering] = useState(false);
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
            
            // Redirect after 2 seconds
            setTimeout(() => {
              router.push('/dashboard');
            }, 2000);
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
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const getStatusMessage = () => {
    switch (status) {
      case 'ready':
        return 'Your workspace is ready';
      case 'failed':
        return 'Deployment failed';
      case 'deploying':
        return 'Setting up your workspace';
      case 'initiated':
        return 'Starting deployment';
      default:
        return 'Waking up Sunday...';
    }
  };

  return (
    <>
      <GL hovering={hovering} />
      
      <div 
        className="relative w-full min-h-screen flex items-center justify-center p-6 transition-colors duration-500"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <div className="max-w-md w-full relative z-10">
          {/* Circular Timer with Logo */}
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
                className="text-slate-200/20 dark:text-slate-700/20"
              />
              
              {/* Progress Circle */}
              <circle
                cx="128"
                cy="128"
                r="120"
                fill="none"
                stroke="url(#gradient)"
                strokeWidth="3"
                strokeDasharray={circumference}
                strokeDashoffset={status === 'ready' ? 0 : strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-1000"
              />
              
              {/* Gradient Definition */}
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FF6B5B" />
                  <stop offset="100%" stopColor="#FF8E53" />
                </linearGradient>
              </defs>
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
                
                {/*
                {status !== 'ready' && status !== 'failed' && (
                  <div className="absolute -bottom-2 -right-2 bg-gradient-to-r from-[#FF6B5B] to-[#FF8E53] rounded-full p-2 shadow-lg">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                )}
                */}
              </div>
            </div>
          </div>

          {/* Status Message */}
          <div className="text-center">
            <p className="text-sm text-white/80 font-medium">
              {getStatusMessage()}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}