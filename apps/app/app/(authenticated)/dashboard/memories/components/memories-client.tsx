"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/design-system/components/ui/card";
import { Button } from "@repo/design-system/components/ui/button";
import { Loader2, Database, AlertCircle, RefreshCw, Trash2, Clock } from "lucide-react";

interface Memory {
  id: string;
  content: string;
  metadata: any;
  created_at: string;
  updated_at: string;
}

interface MemoriesClientProps {
  userId: string;
  isInitialized: boolean;
  hasCredential: boolean;
  setupError: string | null;
  projectStatus: string | null;
}

export function MemoriesClient({ 
  userId, 
  isInitialized, 
  hasCredential, 
  setupError,
  projectStatus 
}: MemoriesClientProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  
  useEffect(() => {
    if (isInitialized) {
      fetchMemories();
    } else {
      setLoading(false);
    }
  }, [isInitialized]);
  
  const fetchMemories = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/memories');
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch memories');
      }
      
      const data = await response.json();
      setMemories(data.memories || []);
    } catch (err) {
      console.error('Error fetching memories:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleDelete = async (memoryId: string) => {
    if (!confirm('Are you sure you want to delete this memory?')) return;
    
    try {
      setDeleting(memoryId);
      
      const response = await fetch(`/api/memories?id=${memoryId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete memory');
      }
      
      setMemories(prev => prev.filter(m => m.id !== memoryId));
    } catch (err) {
      console.error('Error deleting memory:', err);
      alert('Failed to delete memory');
    } finally {
      setDeleting(null);
    }
  };
  
  // Status: Schema initialized but no N8N credential yet
  if (isInitialized && !hasCredential) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500 animate-pulse" />
              N8N Integration Setup in Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-muted-foreground">
                ✅ Database schema created successfully!
              </p>
              <p className="text-muted-foreground">
                ⏳ Waiting for N8N service to be ready... This can take 1-2 minutes as the service boots up.
              </p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                The setup will complete automatically once N8N is ready
              </div>
              <Button onClick={() => window.location.reload()} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Check Status
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Status: Not initialized at all
  if (!isInitialized) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              {projectStatus === 'ready' ? 'Database Setup Required' : 'Project Initialization'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {setupError ? (
                <>
                  <p className="text-red-600 dark:text-red-400">
                    Setup Error: {setupError}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Please contact support if this persists.
                  </p>
                </>
              ) : projectStatus === 'ready' ? (
                <>
                  <p className="text-muted-foreground">
                    Your database is ready to be initialized. Click "Setup Database" on the dashboard to begin.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">
                    Your Northflank project is being created. This usually takes 2-5 minutes.
                  </p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Project Status: {projectStatus || 'creating'}
                  </div>
                </>
              )}
              <Button onClick={() => window.location.reload()} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Page
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Memories</h1>
          <p className="text-muted-foreground">
            AI conversation memories stored in your Postgres database
          </p>
        </div>
        <Button onClick={fetchMemories} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh
        </Button>
      </div>
      
      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Storage Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Memories</p>
              <p className="text-2xl font-bold">{memories.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Database</p>
              <p className="text-lg font-semibold">Northflank Postgres</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Schema</p>
              <p className="text-lg font-semibold">user_data_schema</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Memories List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Memories</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-500">
              <AlertCircle className="h-8 w-8 mx-auto mb-2" />
              <p className="font-semibold">Error loading memories</p>
              <p className="text-sm mt-1">{error}</p>
              <Button onClick={fetchMemories} variant="outline" className="mt-4">
                Try Again
              </Button>
            </div>
          ) : memories.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="font-semibold">No memories yet</p>
              <p className="text-sm">Memories will appear here after AI interactions</p>
            </div>
          ) : (
            <div className="space-y-4">
              {memories.map((memory) => (
                <div
                  key={memory.id}
                  className="p-4 border rounded-lg hover:bg-muted/50 transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm break-words">{memory.content}</p>
                      {memory.metadata && Object.keys(memory.metadata).length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:underline">
                            View metadata
                          </summary>
                          <pre className="mt-2 text-xs text-muted-foreground bg-muted p-2 rounded overflow-auto">
                            {JSON.stringify(memory.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <span>Created: {new Date(memory.created_at).toLocaleString()}</span>
                        <span>ID: {memory.id.slice(0, 8)}...</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(memory.id)}
                      disabled={deleting === memory.id}
                      className="flex-shrink-0"
                    >
                      {deleting === memory.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-red-500" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}