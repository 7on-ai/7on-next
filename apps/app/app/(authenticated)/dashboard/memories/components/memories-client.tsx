// apps/app/app/(authenticated)/dashboard/memories/components/memories-client.tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/design-system/components/ui/card";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Alert, AlertDescription } from "@repo/design-system/components/ui/alert";
import { Loader2, Database, AlertCircle, RefreshCw, Trash2, Clock, Search, Plus, Sparkles, CheckCircle2 } from "lucide-react";

interface OllamaStatus {
  status: 'online' | 'offline' | 'unreachable' | 'pulling';
  models: string[];
  hasNomicEmbed: boolean;
}

export function MemoriesClient({ 
  userId, 
  isInitialized, 
  hasCredential, 
  setupError,
  projectStatus 
}: any) {
  const [memories, setMemories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [searchMode, setSearchMode] = useState<'all' | 'semantic'>('all');
  
  // ✅ NEW: Ollama status
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [checkingOllama, setCheckingOllama] = useState(false);
  
  useEffect(() => {
    if (isInitialized && hasCredential) {
      checkOllamaStatus();
      fetchAllMemories();
    } else {
      setLoading(false);
    }
  }, [isInitialized, hasCredential]);
  
  // ✅ Check Ollama status
  const checkOllamaStatus = async () => {
    try {
      setCheckingOllama(true);
      const response = await fetch('/api/ollama/setup');
      const data = await response.json();
      setOllamaStatus(data);
    } catch (err) {
      console.error('Ollama check error:', err);
    } finally {
      setCheckingOllama(false);
    }
  };
  
  // ✅ Setup Ollama (pull models)
  const setupOllama = async () => {
    try {
      setCheckingOllama(true);
      setError(null);
      
      const response = await fetch('/api/ollama/setup', {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (data.status === 'pulling') {
        setError('Models are being downloaded. This may take 2-3 minutes. Please wait...');
        // Poll status every 10 seconds
        setTimeout(checkOllamaStatus, 10000);
      } else if (data.status === 'ready') {
        setOllamaStatus(data);
        setError(null);
      } else {
        setError(data.error || 'Ollama setup failed');
      }
      
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCheckingOllama(false);
    }
  };
  
  const fetchAllMemories = async () => {
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
      setSearchMode('all');
    } catch (err) {
      console.error('Error fetching memories:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSemanticSearch = async () => {
    if (!searchQuery.trim()) {
      fetchAllMemories();
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/memories?query=${encodeURIComponent(searchQuery)}`);
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Search failed');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setMemories(data.memories || []);
        setSearchMode('semantic');
      } else {
        throw new Error(data.error || 'Search failed');
      }
    } catch (err) {
      console.error('Search error:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMemory = async () => {
    if (!newMessage.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newMessage,
          metadata: {},
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add memory');
      }

      const data = await response.json();
      
      if (data.success) {
        setNewMessage('');
        if (searchMode === 'semantic' && searchQuery) {
          await handleSemanticSearch();
        } else {
          await fetchAllMemories();
        }
      } else {
        throw new Error(data.error || 'Failed to add memory');
      }
    } catch (err) {
      console.error('Add error:', err);
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
                ⏳ Waiting for N8N service to be ready...
              </p>
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
  
  // Status: Not initialized
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
                <p className="text-red-600">{setupError}</p>
              ) : projectStatus === 'ready' ? (
                <p className="text-muted-foreground">
                  Click "Setup Database" on the dashboard to begin.
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Project is being created...
                </p>
              )}
              <Button onClick={() => window.location.reload()} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
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
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-purple-500" />
            Semantic Memories
          </h1>
          <p className="text-muted-foreground">
            AI-powered memory with Ollama + pgvector
          </p>
        </div>
        <Button onClick={fetchAllMemories} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh
        </Button>
      </div>
      
      {/* ✅ Ollama Status Card */}
      {ollamaStatus && (
        <Card className={
          ollamaStatus.status === 'online' && ollamaStatus.hasNomicEmbed
            ? 'border-green-200 dark:border-green-800'
            : 'border-yellow-200 dark:border-yellow-800'
        }>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {ollamaStatus.status === 'online' && ollamaStatus.hasNomicEmbed ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-yellow-500" />
              )}
              Ollama Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Service:</span>
                <span className={`font-semibold ${
                  ollamaStatus.status === 'online' ? 'text-green-600' : 'text-yellow-600'
                }`}>
                  {ollamaStatus.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">nomic-embed-text:</span>
                <span className={`font-semibold ${
                  ollamaStatus.hasNomicEmbed ? 'text-green-600' : 'text-red-600'
                }`}>
                  {ollamaStatus.hasNomicEmbed ? '✅ Ready' : '❌ Missing'}
                </span>
              </div>
              
              {!ollamaStatus.hasNomicEmbed && (
                <Alert className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    The embedding model needs to be downloaded (2-3 minutes)
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="flex gap-2 mt-4">
                <Button 
                  onClick={checkOllamaStatus} 
                  disabled={checkingOllama}
                  variant="outline"
                  size="sm"
                >
                  {checkingOllama ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check Status'}
                </Button>
                
                {!ollamaStatus.hasNomicEmbed && (
                  <Button 
                    onClick={setupOllama} 
                    disabled={checkingOllama}
                    size="sm"
                  >
                    {checkingOllama ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Pull Models
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {/* Semantic Search Card */}
      <Card className="border-purple-200 dark:border-purple-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-purple-500" />
            Semantic Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Search by meaning..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSemanticSearch()}
              className="flex-1"
              disabled={!ollamaStatus?.hasNomicEmbed}
            />
            <Button 
              onClick={handleSemanticSearch} 
              disabled={loading || !ollamaStatus?.hasNomicEmbed} 
              className="bg-purple-600 hover:bg-purple-700"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            🧠 AI understands meaning
          </p>
        </CardContent>
      </Card>

      {/* Add Memory Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add New Memory
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Type something to remember..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddMemory()}
              className="flex-1"
              disabled={!ollamaStatus?.hasNomicEmbed}
            />
            <Button 
              onClick={handleAddMemory} 
              disabled={loading || !newMessage.trim() || !ollamaStatus?.hasNomicEmbed}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            🤖 Converted to 768-dim vectors using Ollama
          </p>
        </CardContent>
      </Card>
      
      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">
                {searchMode === 'semantic' ? 'Search Results' : 'Total Memories'}
              </p>
              <p className="text-2xl font-bold">{memories.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Search Mode</p>
              <p className="text-lg font-semibold">
                {searchMode === 'semantic' ? '🔍 Semantic' : '📋 All'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Embedding Model</p>
              <p className="text-lg font-semibold">Ollama (768-dim)</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Vector Storage</p>
              <p className="text-lg font-semibold">pgvector + HNSW</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Memories List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {searchMode === 'semantic' && searchQuery 
              ? `Results for "${searchQuery}"` 
              : 'All Memories'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : memories.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No memories yet</p>
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
                      
                      {memory.score !== undefined && (
                        <div className="mt-2 inline-flex items-center gap-2 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 rounded text-xs">
                          <Sparkles className="h-3 w-3" />
                          <span>Similarity: {(memory.score * 100).toFixed(1)}%</span>
                        </div>
                      )}
                      
                      <div className="mt-2 text-xs text-muted-foreground">
                        {new Date(memory.created_at).toLocaleString()}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(memory.id)}
                      disabled={deleting === memory.id}
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