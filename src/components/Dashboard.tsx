import React from 'react';
import { useStore } from '../store';
import { StreamCard } from './StreamCard';
import { Card, CardContent } from './ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Tv, Users, Activity, Zap, Loader2 } from 'lucide-react';

function SkeletonCard() {
  return (
    <div className="rounded-xl bg-card/40 border border-border/60 overflow-hidden animate-pulse">
      <div className="aspect-video bg-muted" />
      <div className="p-4 space-y-3">
        <div className="flex gap-3">
          <div className="w-9 h-9 rounded-full bg-muted shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { streams, stats, loading, viewFilter, setViewFilter } = useStore();

  const activeMirrors = streams.filter(s => s.status === 'MIRRORING').length;
  const activeLive = streams.filter(s => s.status === 'LIVE').length;
  const trackedCount = stats?.trackedChannels ?? 0;
  const autoChannels = stats?.autoChannels ?? 0;

  const filteredStreams = viewFilter === 'all' ? streams : streams.filter(s => s.status === viewFilter);

  if (loading) {
    return (
      <div className="flex flex-col gap-8 max-w-7xl mx-auto w-full pb-12">
        <div className="flex flex-col gap-2">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="h-4 w-64 bg-muted rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <Card key={i} className="bg-card/40 border-border/60">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-muted animate-pulse" />
                <div className="space-y-2">
                  <div className="h-3 w-20 bg-muted rounded animate-pulse" />
                  <div className="h-6 w-12 bg-muted rounded animate-pulse" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1,2,3].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto w-full pb-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground">Monitor and manage your active relay engines.</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Users className="w-5 h-5 text-blue-400" />} title="Tracked Channels" value={trackedCount} />
        <StatCard icon={<Zap className="w-5 h-5 text-primary" />} title="Active Mirrors" value={activeMirrors} />
        <StatCard icon={<Tv className="w-5 h-5 text-orange-400" />} title="Live Streams" value={activeLive} />
        <StatCard icon={<Activity className="w-5 h-5 text-purple-400" />} title="Auto Channels" value={autoChannels} />
      </div>

      <div className="flex flex-col gap-4 mt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Live Stream Feed</h2>
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {streams.filter(s => s.status !== 'ENDED').length > 0 ? 'Live Updates' : 'No Active Streams'}
            </span>
          </div>
        </div>

        {/* Filter Tabs */}
        <Tabs value={viewFilter} onValueChange={setViewFilter} className="w-full">
          <TabsList className="bg-card/60 border border-border">
            <TabsTrigger value="all" className="text-xs">All ({streams.length})</TabsTrigger>
            <TabsTrigger value="LIVE" className="text-xs text-red-400 data-[state=active]:text-red-400">Live ({activeLive})</TabsTrigger>
            <TabsTrigger value="MIRRORING" className="text-xs text-primary data-[state=active]:text-primary">Mirroring ({activeMirrors})</TabsTrigger>
            <TabsTrigger value="ENDED" className="text-xs text-muted-foreground">Ended</TabsTrigger>
          </TabsList>
        </Tabs>
        
        {filteredStreams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-xl bg-card/20">
            <div className="w-16 h-16 rounded-full bg-card flex items-center justify-center mb-4">
               <Tv className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <h3 className="font-semibold text-lg">No {viewFilter !== 'all' ? viewFilter.toLowerCase() : ''} streams</h3>
            <p className="text-muted-foreground text-sm max-w-sm text-center mt-2">
              {viewFilter === 'all' 
                ? 'No channels are currently live. Add channels or connect a YouTube account to get started.'
                : viewFilter === 'LIVE' 
                  ? 'No live streams right now. The background worker will detect them automatically.'
                  : viewFilter === 'MIRRORING'
                    ? 'No active mirrors. Start mirroring a live stream to see it here.'
                    : 'No ended streams yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredStreams.map((stream) => (
              <StreamCard key={stream.id} stream={stream} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, title, value }: { icon: React.ReactNode, title: string, value: number | string }) {
  return (
    <Card className="bg-card/40 border-border/60 hover:bg-card/60 transition-colors">
      <CardContent className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-background/50 border border-border flex items-center justify-center">
          {icon}
        </div>
        <div>
          <p className="text-sm text-muted-foreground font-medium mb-1">{title}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
