export type YouTubeAccount = {
  id: string;
  user_id?: string;
  youtube_channel_id?: string;
  name: string;
  avatar: string;
  subscriber_count?: string;
  oauth_tokens?: string;
};

export type TrackedChannel = {
  id: string;
  account_id?: string;
  channelId: string;
  name: string;
  avatar: string;
  subscriberCount?: string;
  autoMonitor: boolean;
  autoMirror: boolean;
  scanFrequency: number;
  notifications?: {
    live_detected: boolean;
    mirroring_started: boolean;
    mirroring_ended: boolean;
    stream_ended: boolean;
  };
};

export type StreamStatus = 'LIVE' | 'MIRRORING' | 'ENDED';
export type StreamType = '16:9' | '9:16';

export type YouTubeStream = {
  id: string;
  sourceStreamId?: string;
  channelId: string;
  title: string;
  description?: string;
  thumbnail: string;
  status: StreamStatus;
  type: StreamType;
  viewerCount: number;
  startedAt: string;
  channel_name?: string;
  channel_avatar?: string;
  account_id?: string;
};

export type MirroringJob = {
  id: string;
  account_id: string;
  source_stream_id: string;
  target_broadcast_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  stream_title?: string;
  stream_thumbnail?: string;
  ingest_url?: string;
  stream_name?: string;
};

export type SearchResult = {
  channels: {
    id: string;
    name: string;
    avatar: string;
    subscriberCount: string;
  }[];
  streams: {
    id: string;
    title: string;
    channelName: string;
    channelId: string;
    thumbnail: string;
    viewerCount: number;
    status: StreamStatus;
    type: StreamType;
  }[];
};

export type Stats = {
  trackedChannels: number;
  activeMirrors: number;
  activeStreams: number;
  autoChannels: number;
};

export interface AppState {
  connectedAccounts: YouTubeAccount[];
  activeAccount: YouTubeAccount | null;
  trackedChannels: TrackedChannel[];
  streams: YouTubeStream[];
  mirroringJobs: MirroringJob[];
  searchResults: SearchResult | null;
  searchLoading: boolean;
  stats: Stats | null;
  loading: boolean;
  error: string | null;
  viewFilter: string;
}
