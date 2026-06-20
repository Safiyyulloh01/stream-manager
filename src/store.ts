import { create } from 'zustand';
import { TrackedChannel, YouTubeAccount, YouTubeStream, AppState, MirroringJob, SearchResult, Stats } from './types';

interface Store extends AppState {
  setActiveAccount: (account: YouTubeAccount) => void;
  setViewFilter: (filter: string) => void;
  addAccount: (name: string, youtubeChannelId?: string) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  addChannel: (channel: TrackedChannel) => Promise<void>;
  removeChannel: (id: string) => Promise<void>;
  updateChannelSettings: (id: string, settings: Partial<TrackedChannel>) => Promise<void>;
  startMirroring: (streamId: string) => Promise<void>;
  stopMirroring: (streamId: string) => Promise<void>;
  endStream: (streamId: string) => Promise<void>;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  initFetch: () => Promise<void>;
  wsConnect: () => void;
  refreshCurrentAccount: () => Promise<void>;
  fetchMirroringJobs: () => Promise<void>;
  fetchStats: () => Promise<void>;
}

function mapDBChannel(row: any): TrackedChannel {
  let notifications = { live_detected: true, mirroring_started: true, mirroring_ended: true, stream_ended: true };
  try { if (row.notifications) notifications = JSON.parse(row.notifications); } catch {}
  return {
    id: row.id,
    account_id: row.account_id,
    channelId: row.channel_id,
    name: row.channel_name,
    avatar: row.channel_avatar || '',
    subscriberCount: '',
    autoMonitor: !!row.auto_monitor,
    autoMirror: !!row.auto_mirror,
    scanFrequency: row.scan_frequency || 5,
    notifications,
  };
}

function mapDBStream(row: any): YouTubeStream {
  return {
    id: row.id,
    sourceStreamId: row.source_stream_id,
    channelId: row.tracked_channel_id,
    title: row.title,
    description: row.description,
    thumbnail: row.thumbnail || '',
    status: row.status,
    type: row.stream_type || '16:9',
    viewerCount: row.viewer_count || 0,
    startedAt: row.started_at || new Date().toISOString(),
    channel_name: row.channel_name,
    channel_avatar: row.channel_avatar,
    account_id: row.account_id,
  };
}

export const useStore = create<Store>((set, get) => ({
  connectedAccounts: [],
  activeAccount: null,
  trackedChannels: [],
  streams: [],
  mirroringJobs: [],
  searchResults: null,
  searchLoading: false,
  stats: null,
  loading: true,
  error: null,
  viewFilter: 'all',

  setViewFilter: (filter) => set({ viewFilter: filter }),

  setActiveAccount: (account) => {
    set({ activeAccount: account });
    // Immediately load data for this account
    get().refreshCurrentAccount();
  },

  addAccount: async (name, youtubeChannelId) => {
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, youtubeChannelId }),
      });
      if (res.ok) {
        const account = await res.json();
        set((state) => ({
          connectedAccounts: [...state.connectedAccounts, account],
        }));
      }
    } catch (e) {
      console.error('Failed to add account:', e);
    }
  },

  removeAccount: async (id) => {
    try {
      await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
      set((state) => {
        const accounts = state.connectedAccounts.filter(a => a.id !== id);
        let activeAccount = state.activeAccount;
        if (activeAccount?.id === id) activeAccount = accounts[0] || null;
        return { connectedAccounts: accounts, activeAccount };
      });
      if (get().activeAccount) get().refreshCurrentAccount();
    } catch (e) {
      console.error('Failed to remove account:', e);
    }
  },

  addChannel: async (channel) => {
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          accountId: get().activeAccount?.id, 
          channelId: channel.channelId,
          channelName: channel.name,
          channelAvatar: channel.avatar,
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        const mapped = mapDBChannel(saved);
        // Deduplicate — WS CHANNEL_ADDED may have already added it
        set((state) => ({
          trackedChannels: state.trackedChannels.some(c => c.id === mapped.id)
            ? state.trackedChannels
            : [...state.trackedChannels, mapped],
        }));
      }
    } catch(e) {
      console.error('Failed to add channel:', e);
    }
  },

  removeChannel: async (id) => {
    try {
      await fetch(`/api/channels/${id}`, { method: 'DELETE' });
    } catch(e) {}
    set((state) => ({
      trackedChannels: state.trackedChannels.filter(c => c.id !== id),
      streams: state.streams.filter(s => s.channelId !== id),
    }));
  },

  updateChannelSettings: async (id, settings) => {
    // Optimistic update
    set((state) => ({
      trackedChannels: state.trackedChannels.map(c => 
        c.id === id ? { ...c, ...settings } : c
      )
    }));
    // Persist to backend
    try {
      const body: any = {};
      if (settings.autoMonitor !== undefined) body.autoMonitor = settings.autoMonitor;
      if (settings.autoMirror !== undefined) body.autoMirror = settings.autoMirror;
      if (settings.scanFrequency !== undefined) body.scanFrequency = settings.scanFrequency;
      if (settings.notifications !== undefined) body.notifications = settings.notifications;
      await fetch(`/api/channels/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch(e) {}
  },

  startMirroring: async (streamId) => {
    try {
      const res = await fetch(`/api/streams/${streamId}/mirror`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        set((state) => ({
          streams: state.streams.map(s => 
            s.id === streamId ? { ...s, status: 'MIRRORING' as const } : s
          ),
        }));
      }
    } catch(e) {}
  },

  stopMirroring: async (streamId) => {
    try {
      const res = await fetch(`/api/streams/${streamId}/stop`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        set((state) => ({
          streams: state.streams.map(s => 
            s.id === streamId ? { ...s, status: 'ENDED' as const } : s
          ),
        }));
      }
    } catch(e) {}
  },

  endStream: async (streamId) => {
    try {
      await fetch(`/api/streams/${streamId}/stop`, { method: 'POST' });
      set((state) => ({
        streams: state.streams.map(s => 
          s.id === streamId ? { ...s, status: 'ENDED' as const } : s
        ),
      }));
    } catch(e) {}
  },

  search: async (query) => {
    if (!query || query.length < 2) {
      set({ searchResults: null, searchLoading: false });
      return;
    }
    set({ searchLoading: true });
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const results = await res.json();
        set({ searchResults: results, searchLoading: false });
      }
    } catch(e) {
      set({ searchLoading: false });
    }
  },

  clearSearch: () => set({ searchResults: null, searchLoading: false }),

  initFetch: async () => {
    set({ loading: true, error: null });
    try {
      const accountsRes = await fetch('/api/accounts');
      if (accountsRes.ok) {
        const accounts: YouTubeAccount[] = await accountsRes.json();
        set({ connectedAccounts: accounts });
        
        if (accounts.length > 0) {
          const active = accounts[0];
          set({ activeAccount: active });
          
          // Load channels and streams for active account
          const channelsRes = await fetch(`/api/channels/${active.id}`);
          if (channelsRes.ok) {
            const channels = await channelsRes.json();
            set({ trackedChannels: channels.map(mapDBChannel) });
          }
          
          const streamsRes = await fetch(`/api/streams/${active.id}`);
          if (streamsRes.ok) {
            const streams = await streamsRes.json();
            set({ streams: streams.map(mapDBStream) });
          }

          // Load mirroring jobs
          const jobsRes = await fetch(`/api/mirroring-jobs/${active.id}`);
          if (jobsRes.ok) {
            const jobs = await jobsRes.json();
            set({ mirroringJobs: jobs });
          }

          // Load stats
          const statsRes = await fetch(`/api/stats/${active.id}`);
          if (statsRes.ok) {
            const stats = await statsRes.json();
            set({ stats });
          }
        }
      }
    } catch(e) {
      set({ error: 'Failed to load data from server' });
    } finally {
      set({ loading: false });
    }
  },

  refreshCurrentAccount: async () => {
    const { activeAccount } = get();
    if (!activeAccount) return;
    
    try {
      const channelsRes = await fetch(`/api/channels/${activeAccount.id}`);
      if (channelsRes.ok) {
        const channels = await channelsRes.json();
        set({ trackedChannels: channels.map(mapDBChannel) });
      }
      
      const streamsRes = await fetch(`/api/streams/${activeAccount.id}`);
      if (streamsRes.ok) {
        const streams = await streamsRes.json();
        set({ streams: streams.map(mapDBStream) });
      }

      const jobsRes = await fetch(`/api/mirroring-jobs/${activeAccount.id}`);
      if (jobsRes.ok) {
        const jobs = await jobsRes.json();
        set({ mirroringJobs: jobs });
      }

      const statsRes = await fetch(`/api/stats/${activeAccount.id}`);
      if (statsRes.ok) {
        const stats = await statsRes.json();
        set({ stats });
      }
    } catch(e) {
      console.error('Failed to refresh account data:', e);
    }
  },

  fetchMirroringJobs: async () => {
    const { activeAccount } = get();
    if (!activeAccount) return;
    try {
      const res = await fetch(`/api/mirroring-jobs/${activeAccount.id}`);
      if (res.ok) {
        const jobs = await res.json();
        set({ mirroringJobs: jobs });
      }
    } catch(e) {}
  },

  fetchStats: async () => {
    const { activeAccount } = get();
    if (!activeAccount) return;
    try {
      const res = await fetch(`/api/stats/${activeAccount.id}`);
      if (res.ok) {
        const stats = await res.json();
        set({ stats });
      }
    } catch(e) {}
  },

  wsConnect: () => {
    // Use relative protocol — works in both dev and prod
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("WS:", data.type, data.payload);
        
        const { streams, trackedChannels, activeAccount } = get();
        
        switch (data.type) {
          case "STREAM_DETECTED":
          case "STREAM_UPDATED": {
            const s = data.payload;
            if (s.account_id && activeAccount && s.account_id !== activeAccount.id) break;
            const updated = mapDBStream(s);
            set({
              streams: streams.some(st => st.id === updated.id)
                ? streams.map(st => st.id === updated.id ? updated : st)
                : [...streams, updated]
            });
            get().fetchStats();
            break;
          }
          case "STREAM_ENDED": {
            const s = data.payload;
            const ended = mapDBStream(s);
            set({
              streams: streams.map(st => st.id === ended.id ? ended : st)
            });
            get().fetchStats();
            get().fetchMirroringJobs();
            break;
          }
          case "CHANNEL_ADDED": {
            const mapped = mapDBChannel(data.payload);
            if (!trackedChannels.find(c => c.id === mapped.id)) {
              set({ trackedChannels: [...trackedChannels, mapped] });
            }
            break;
          }
          case "CHANNEL_UPDATED": {
            const mapped = mapDBChannel(data.payload);
            set({
              trackedChannels: trackedChannels.map(c => c.id === mapped.id ? mapped : c)
            });
            break;
          }
          case "CHANNEL_REMOVED": {
            set({
              trackedChannels: trackedChannels.filter(c => c.id !== data.payload.id),
              streams: streams.filter(s => s.channelId !== data.payload.id),
            });
            break;
          }
          case "ACCOUNT_ADDED": {
            set({ connectedAccounts: [...get().connectedAccounts, data.payload] });
            break;
          }
          case "ACCOUNT_REMOVED": {
            set({ connectedAccounts: get().connectedAccounts.filter(a => a.id !== data.payload.id) });
            break;
          }
          case "MIRRORING_STARTED":
          case "MIRRORING_STOPPED": {
            get().fetchMirroringJobs();
            break;
          }
        }
      } catch(e) {}
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting in 3s...');
      setTimeout(() => get().wsConnect(), 3000);
    };
  },
}));
