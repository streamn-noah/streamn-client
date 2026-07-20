import React, { useEffect, useState, useRef, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  TouchableWithoutFeedback,
  ScrollView,
  Modal,
  AppState,
  PanResponder,
  LayoutChangeEvent,
  Easing,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Icon from 'react-native-remix-icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { MediaSummary, MediaType, tmdbImage, Episode, Season } from '@/services/media';
import { fetchStreamSources, SourceItem, SubtitleItem } from '@/services/stream-source';
import { saveWatchProgress, getWatchProgress, getPreferredVideoQuality } from '@/services/storage';
import { getDownload } from '@/services/download';
import { getMediaDetail, getSeasonEpisodes } from '@/services/tmdb';
import { typography } from '@/constants/theme';

export type CustomPlayerHandle = {
  postCommand: (func: string, args?: any[]) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getIsPlaying: () => boolean;
};

type CustomPlayerProps = {
  mediaType: MediaType;
  mediaId: number;
  season?: number;
  episode?: number;
  item: MediaSummary;
  onClose: () => void;
  runtimeMinutes?: number | null;
  fileSizeRange?: string | null;
  isWatchParty?: boolean;
  onWatchPartyToggle?: () => void;
  onVideoEvent?: (type: string, currentTime: number, duration: number) => void;
  autoPlay?: boolean;
  hideBackButton?: boolean;
};

type VTTCue = { start: number; end: number; text: string };

type IntroDbSegment = {
  startMs: number;
  endMs: number | null;
  durationMs: number | null;
  startsAtBeginning: boolean;
  endsAtMediaEnd: boolean;
};

type IntroDbMediaRecord = {
  intro: IntroDbSegment[];
  recap: IntroDbSegment[];
  credits: IntroDbSegment[];
  preview: IntroDbSegment[];
};

// Web-Style Circular Spinner Loader
function WebStyleSpinner({ percent, size = 64 }: { percent?: number; size?: number }) {
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: Math.max(3, Math.round(size / 14)),
          borderColor: 'rgba(255, 255, 255, 0.2)',
          borderTopColor: '#FFFFFF',
          transform: [{ rotate: spin }],
        }}
      />
      {percent !== undefined && (
        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
          {`${percent}%`}
        </Text>
      )}
    </View>
  );
}

function parseVTTTime(timeStr: string): number {
  const parts = timeStr.replace(',', '.').split(':');
  let hours = 0, minutes = 0, seconds = 0;
  if (parts.length === 3) {
    hours = parseFloat(parts[0]);
    minutes = parseFloat(parts[1]);
    seconds = parseFloat(parts[2]);
  } else {
    minutes = parseFloat(parts[0]);
    seconds = parseFloat(parts[1]);
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function parseVTT(text: string): VTTCue[] {
  const lines = text.split(/\r?\n/);
  const cues: VTTCue[] = [];
  let currentCue: VTTCue | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes('-->')) {
      const parts = line.split('-->');
      const start = parseVTTTime(parts[0].trim());
      const end = parseVTTTime(parts[1].trim().split(' ')[0]);
      currentCue = { start, end, text: '' };
    } else if (line === '') {
      if (currentCue) {
        cues.push(currentCue);
        currentCue = null;
      }
    } else if (currentCue) {
      const cleanLine = line.replace(/<[^>]+>/g, '');
      if (cleanLine) {
        currentCue.text += (currentCue.text ? '\n' : '') + cleanLine;
      }
    }
  }
  if (currentCue) cues.push(currentCue);
  return cues;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (num: number) => String(num).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function findActiveSegment(
  segments: IntroDbSegment[],
  currentTimeSeconds: number,
  durationSeconds: number,
): IntroDbSegment | null {
  const currentTimeMs = currentTimeSeconds * 1000;
  const fallbackEndMs =
    durationSeconds > 0 ? Math.max(durationSeconds * 1000, currentTimeMs) : Number.POSITIVE_INFINITY;

  return (
    segments.find((segment) => {
      const endMs = segment.endMs ?? fallbackEndMs;
      return currentTimeMs >= segment.startMs && currentTimeMs < endMs;
    }) ?? null
  );
}

const CustomPlayer = forwardRef<CustomPlayerHandle, CustomPlayerProps>(function CustomPlayer(
  {
    mediaType,
    mediaId,
    season: initialSeason = 1,
    episode: initialEpisode = 1,
    item,
    onClose,
    fileSizeRange,
    isWatchParty = false,
    onWatchPartyToggle,
    onVideoEvent,
    autoPlay = true,
    hideBackButton = false,
  },
  ref
) {
  const insets = useSafeAreaInsets();

  // Active TV season & episode
  const [currentSeason, setCurrentSeason] = useState(initialSeason);
  const [currentEpisode, setCurrentEpisode] = useState(initialEpisode);
  const [currentEpisodeTitle, setCurrentEpisodeTitle] = useState<string>('');

  // Sources & Subtitles
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceIndex, setSourceIndex] = useState(0);

  // Player UI state
  const [showControls, setShowControls] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [showUnlockButton, setShowUnlockButton] = useState(false);
  const lockUnlockTimer = useRef<any>(null);

  // Active menus / Modals
  const [activeMenu, setActiveMenu] = useState<'subtitles' | 'speed' | 'quality' | 'episodes' | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Episode browser data
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonForEpisodes, setSelectedSeasonForEpisodes] = useState<number>(initialSeason);
  const [episodesMap, setEpisodesMap] = useState<Record<number, Episode[]>>({});
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  // Animation & Timers
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const skipAnim = useRef(new Animated.Value(0)).current;
  const hideControlsTimer = useRef<any>(null);

  // Subtitles
  const [vttCues, setVttCues] = useState<VTTCue[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState<number>(0);

  // Playback state
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const progressRef = useRef({ currentTime: 0, duration: 0 });
  const hasSeekedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [bufferPercent, setBufferPercent] = useState(0);

  // Scrubber / Slider state
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const trackWidthRef = useRef(0);
  const trackPageXOffsetRef = useRef(0);

  // IntroDB segments
  const [introDbSegments, setIntroDbSegments] = useState<IntroDbMediaRecord | null>(null);
  const [hasSkippedMovieCredits, setHasSkippedMovieCredits] = useState(false);

  // Fetch stream sources & IntroDB
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    hasSeekedRef.current = false;

    fetchStreamSources(mediaType, mediaId, currentSeason, currentEpisode)
      .then(async (data) => {
        if (!active) return;
        if (data.sources && data.sources.length > 0) {
          setSources(data.sources);
          setSubtitles(data.subtitles || []);

          const prefQuality = await getPreferredVideoQuality();
          const qualityMap: Record<string, string[]> = {
            hd: ['1080p', '1080', 'hd', '720p', '480p', '360p'],
            best: ['720p', '720', '1080p', '480p', '360p'],
            better: ['480p', '480', '360p', '720p', '1080p'],
            good: ['360p', '360', '480p', '720p', '1080p'],
          };
          const targets = qualityMap[prefQuality] || qualityMap['hd'];
          let targetIdx = 0;
          for (const t of targets) {
            const found = data.sources.findIndex((s) => s.quality?.toLowerCase().includes(t));
            if (found >= 0) {
              targetIdx = found;
              break;
            }
          }
          setSourceIndex(targetIdx);
        } else {
          setError('No streams available.');
        }
      })
      .catch((err) => {
        if (active) setError(err.message || 'Failed to load stream.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    // Fetch IntroDB
    const introDbUrl = new URL('https://api.theintrodb.org/v3/media');
    introDbUrl.searchParams.set('tmdb_id', String(mediaId));
    if (mediaType === 'tv') {
      introDbUrl.searchParams.set('season', String(currentSeason));
      introDbUrl.searchParams.set('episode', String(currentEpisode));
    }

    fetch(introDbUrl.toString(), { headers: { Accept: 'application/json' } })
      .then((res) => res.json())
      .then((payload) => {
        if (!active || payload.error) return;
        const normalizeSegments = (segments: any[]) => {
          return (segments || []).map((segment) => {
            const startMs = segment.start_ms ?? 0;
            const endMs = segment.end_ms ?? null;
            return {
              startMs,
              endMs,
              durationMs: endMs != null ? Math.max(endMs - startMs, 0) : null,
              startsAtBeginning: segment.start_ms == null,
              endsAtMediaEnd: segment.end_ms == null,
            };
          });
        };
        setIntroDbSegments({
          intro: normalizeSegments(payload?.intro),
          recap: normalizeSegments(payload?.recap),
          credits: normalizeSegments(payload?.credits),
          preview: normalizeSegments(payload?.preview),
        });
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [mediaType, mediaId, currentSeason, currentEpisode]);

  // Load offline subtitles & IntroDB timestamps if playing a downloaded file
  useEffect(() => {
    const downloadItem = getDownload(mediaType, mediaId, currentSeason, currentEpisode);
    if (downloadItem) {
      if (downloadItem.localSubtitleUri) {
        setSubtitles([
          {
            url: downloadItem.localSubtitleUri,
            language: downloadItem.subtitleLanguage || 'English',
            label: 'Offline Subtitles',
          },
        ]);
        setSelectedSubtitle(0);
      }
      if (downloadItem.introDbSegments) {
        setIntroDbSegments(downloadItem.introDbSegments);
      }
    }
  }, [mediaType, mediaId, currentSeason, currentEpisode]);

  // Fetch TV series detail & season episodes
  useEffect(() => {
    if (mediaType !== 'tv') return;

    getMediaDetail('tv', mediaId).then((detail) => {
      if (detail && detail.seasons) {
        setSeasons(detail.seasons.filter((s) => s.seasonNumber > 0));
      }
    });
  }, [mediaId, mediaType]);

  const loadEpisodesForSeason = useCallback(
    async (sNum: number) => {
      if (episodesMap[sNum]) return;
      setLoadingEpisodes(true);
      try {
        const eps = await getSeasonEpisodes(mediaId, sNum);
        setEpisodesMap((prev) => ({ ...prev, [sNum]: eps }));
        if (sNum === currentSeason) {
          const matched = eps.find((e) => e.episodeNumber === currentEpisode);
          if (matched) setCurrentEpisodeTitle(matched.name);
        }
      } catch (err) {
        console.error('Failed to load season episodes', err);
      } finally {
        setLoadingEpisodes(false);
      }
    },
    [mediaId, episodesMap, currentSeason, currentEpisode]
  );

  useEffect(() => {
    if (mediaType === 'tv') {
      loadEpisodesForSeason(selectedSeasonForEpisodes);
    }
  }, [selectedSeasonForEpisodes, mediaType, loadEpisodesForSeason]);

  const activeSource = sources[sourceIndex];

  const tryNextSource = useCallback(() => {
    if (sourceIndex < sources.length - 1) {
      setSourceIndex(sourceIndex + 1);
      setIsBuffering(true);
    } else {
      setError('The sources are currently down.');
      setIsBuffering(false);
    }
  }, [sourceIndex, sources]);

  const videoSource = useMemo(() => {
    if (!activeSource?.url) return null;

    if (activeSource.type === 'local' || activeSource.url.startsWith('file://')) {
      return { uri: activeSource.url };
    }

    const cleanedUrl = activeSource.url.replace(/(https?:\/\/[^/]+)\/\/+/g, '$1/');
    const isHls = cleanedUrl.includes('.m3u8') || activeSource.type === 'hls' || activeSource.type === 'm3u8';
    const backendUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
    const videoProxyUrl = process.env.EXPO_PUBLIC_VIDEO_PROXY_URL || `${backendUrl}/api/proxy/video`;

    const proxyUrl = isHls ? cleanedUrl : `${videoProxyUrl}?url=${encodeURIComponent(cleanedUrl)}`;

    return {
      uri: proxyUrl,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        Accept: 'video/mp4,video/*;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    };
  }, [activeSource]);

  const player = useVideoPlayer(videoSource, (p) => {
    if (autoPlay) p.play();
  });

  useImperativeHandle(
    ref,
    () => ({
      postCommand: (func: string, args: any[] = []) => {
        if (!player) return;
        try {
          if (func === 'play') {
            player.play();
          } else if (func === 'pause') {
            player.pause();
          } else if (func === 'seek') {
            const target = args[0];
            if (typeof target === 'number') {
              Object.assign(player, { currentTime: target });
              setCurrentTime(target);
            }
          }
        } catch (err) {
          console.error('[CustomPlayer] Error handling command:', func, err);
        }
      },
      getCurrentTime: () => player?.currentTime || progressRef.current.currentTime || 0,
      getDuration: () => player?.duration || progressRef.current.duration || 0,
      getIsPlaying: () => player?.playing ?? isPlaying,
    }),
    [player, isPlaying]
  );

  const handleNextEpisode = useCallback(() => {
    if (mediaType !== 'tv') return;
    const currentSeasonEps = episodesMap[currentSeason] || [];
    const hasNextInSeason = currentSeasonEps.some((e) => e.episodeNumber === currentEpisode + 1);

    if (hasNextInSeason) {
      setCurrentEpisode((prev) => prev + 1);
    } else {
      const nextSeasonObj = seasons.find((s) => s.seasonNumber === currentSeason + 1);
      if (nextSeasonObj) {
        setCurrentSeason(nextSeasonObj.seasonNumber);
        setCurrentEpisode(1);
        setSelectedSeasonForEpisodes(nextSeasonObj.seasonNumber);
      } else {
        setCurrentEpisode(1);
      }
    }
  }, [mediaType, episodesMap, currentSeason, currentEpisode, seasons]);

  // Auto-play next episode when TV episode finishes
  useEffect(() => {
    if (!player || mediaType !== 'tv') return;

    const endSub = player.addListener('playToEnd', () => {
      console.log('[Player] Video finished, auto-playing next episode...');
      handleNextEpisode();
    });

    return () => {
      endSub.remove();
    };
  }, [player, mediaType, handleNextEpisode]);

  useEffect(() => {
    if (!player) return;

    const timeUpdateSub = player.addListener('timeUpdate', (e) => {
      if (!isScrubbing) {
        setCurrentTime(e.currentTime);
      }
      setDuration(player.duration || 0);
      if (e.currentTime > 0) {
        progressRef.current = { currentTime: e.currentTime, duration: player.duration || 0 };
      }
    });

    const statusSub = player.addListener('statusChange', async (e) => {
      if (e.status === 'readyToPlay') {
        setIsBuffering(false);
        setDuration(player.duration || 0);
        onVideoEvent?.('ready', player.currentTime || 0, player.duration || 0);

        if (!hasSeekedRef.current) {
          hasSeekedRef.current = true;
          try {
            const progress = await getWatchProgress(mediaType, mediaId);
            if (progress && progress.progressSeconds > 5) {
              const isSameEpisode =
                mediaType === 'movie' ||
                (progress.seasonNumber === currentSeason && progress.episodeNumber === currentEpisode);

              if (isSameEpisode) {
                Object.assign(player, { currentTime: progress.progressSeconds });
              }
            }
          } catch (err) {
            console.error('Error seeking to watch progress:', err);
          }
        }
      } else if (e.status === 'loading') {
        setIsBuffering(true);
      } else if (e.status === 'error') {
        tryNextSource();
      }
    });

    const playingSub = player.addListener('playingChange', (e) => {
      setIsPlaying(e.isPlaying);
      if (e.isPlaying) setIsBuffering(false);
      onVideoEvent?.(e.isPlaying ? 'play' : 'pause', player.currentTime || 0, player.duration || 0);
    });

    const fallbackInt = setInterval(() => {
      try {
        if (player && player.currentTime > 0) {
          if (!isScrubbing) {
            setCurrentTime(player.currentTime);
          }
          if (player.duration > 0) setDuration(player.duration);
          progressRef.current = { currentTime: player.currentTime, duration: player.duration || 0 };
        }
      } catch (e) {}
    }, 1000);

    return () => {
      timeUpdateSub.remove();
      statusSub.remove();
      playingSub.remove();
      clearInterval(fallbackInt);
    };
  }, [player, tryNextSource, mediaType, mediaId, currentSeason, currentEpisode, isScrubbing]);

  const handleClose = () => {
    if (player) {
      try {
        player.pause();
      } catch (e) {}
    }
    onClose();
  };

  // Watch progress saving
  useEffect(() => {
    const saveProgress = () => {
      const { currentTime, duration } = progressRef.current;
      if (currentTime > 5) {
        saveWatchProgress({
          ...item,
          mediaType,
          seasonNumber: currentSeason,
          episodeNumber: currentEpisode,
          progressSeconds: currentTime,
          durationSeconds: duration || 0,
          updatedAt: Date.now(),
        });
      }
    };

    const interval = setInterval(saveProgress, 10000);
    return () => {
      clearInterval(interval);
      saveProgress();
    };
  }, [item, mediaType, currentSeason, currentEpisode]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && player) {
        try {
          player.pause();
        } catch (e) {}
      }
    });
    return () => {
      sub.remove();
      try {
        player?.pause();
      } catch (e) {}
    };
  }, [player]);

  // VTT Subtitles with ATS HTTPS fix
  useEffect(() => {
    const fetchVtt = async () => {
      if (!subtitles[selectedSubtitle]) {
        setVttCues([]);
        return;
      }
      try {
        let subUrl = subtitles[selectedSubtitle].url || '';
        if (subUrl.startsWith('http://')) {
          subUrl = subUrl.replace(/^http:\/\//i, 'https://');
        }
        const res = await fetch(subUrl);
        const text = await res.text();
        setVttCues(parseVTT(text));
      } catch (err) {
        console.warn('Failed to load VTT subtitle track:', err);
        setVttCues([]);
      }
    };
    fetchVtt();
  }, [selectedSubtitle, subtitles]);

  const activeCue = useMemo(() => {
    const timeToMatch = isScrubbing ? scrubTime : currentTime;
    return vttCues.find((cue) => timeToMatch >= cue.start && timeToMatch <= cue.end);
  }, [vttCues, currentTime, scrubTime, isScrubbing]);

  // Scrubber Track Highlight Segment Indicators
  const segmentIndicators = useMemo(() => {
    if (!introDbSegments || duration <= 0) return [];
    const list: { startPct: number; widthPct: number; type: string }[] = [];
    const all = [
      ...(introDbSegments.intro || []).map((s) => ({ ...s, label: 'Intro' })),
      ...(introDbSegments.recap || []).map((s) => ({ ...s, label: 'Recap' })),
      ...(introDbSegments.credits || []).map((s) => ({ ...s, label: 'Credits' })),
    ];
    for (const seg of all) {
      if (seg.startMs != null) {
        const startSec = seg.startMs / 1000;
        const endSec = (seg.endMs ?? duration * 1000) / 1000;
        const startPct = Math.max(0, Math.min((startSec / duration) * 100, 100));
        const endPct = Math.max(0, Math.min((endSec / duration) * 100, 100));
        const widthPct = Math.max(0.6, endPct - startPct);
        list.push({ startPct, widthPct, type: seg.label });
      }
    }
    return list;
  }, [introDbSegments, duration]);

  // Skip Intro / Outro Segment detection (ONLY active when inside the timestamp window)
  const activeSkipSegment = useMemo(() => {
    if (!introDbSegments || duration === 0) return null;
    const timeToMatch = isScrubbing ? scrubTime : currentTime;
    const currentTimeMs = timeToMatch * 1000;

    for (const seg of introDbSegments.intro || []) {
      const endMs = seg.endMs ?? duration * 1000;
      if (currentTimeMs >= seg.startMs && currentTimeMs <= endMs) {
        return 'SKIP INTRO';
      }
    }

    for (const seg of introDbSegments.recap || []) {
      const endMs = seg.endMs ?? duration * 1000;
      if (currentTimeMs >= seg.startMs && currentTimeMs <= endMs) {
        return 'SKIP RECAP';
      }
    }

    for (const seg of introDbSegments.credits || []) {
      const endMs = seg.endMs ?? duration * 1000;
      if (currentTimeMs >= seg.startMs && currentTimeMs <= endMs) {
        if (mediaType === 'movie' && hasSkippedMovieCredits) continue;
        return 'SKIP CREDITS';
      }
    }

    if (mediaType === 'tv' && duration > 0 && duration - timeToMatch <= 90) {
      return 'PLAY NEXT';
    }

    return null;
  }, [introDbSegments, currentTime, scrubTime, isScrubbing, duration, mediaType, hasSkippedMovieCredits]);

  // Spring animation for Skip button (fade-in & bottom-up slide)
  useEffect(() => {
    if (activeSkipSegment) {
      Animated.spring(skipAnim, {
        toValue: 1,
        tension: 65,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(skipAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [activeSkipSegment, skipAnim]);

  const skipTranslateY = skipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });

  const handleSkipSegment = () => {
    if (activeSkipSegment === 'PLAY NEXT') {
      handleNextEpisode();
      return;
    }

    if (!introDbSegments || !activeSkipSegment || !player) return;
    const allSegments = [
      ...introDbSegments.intro.map((s) => ({ ...s, type: 'SKIP INTRO' })),
      ...introDbSegments.recap.map((s) => ({ ...s, type: 'SKIP RECAP' })),
      ...introDbSegments.credits.map((s) => ({ ...s, type: 'SKIP CREDITS' })),
    ];
    const timeToMatch = isScrubbing ? scrubTime : currentTime;
    for (const seg of allSegments) {
      const match = findActiveSegment([seg], timeToMatch, duration);
      if (match && seg.endMs) {
        const target = seg.endMs / 1000;
        Object.assign(player, { currentTime: target });
        setCurrentTime(target);
        if (mediaType === 'movie' && seg.type === 'SKIP CREDITS') {
          setHasSkippedMovieCredits(true);
        }
        break;
      }
    }
  };

  const handleRestart = () => {
    if (player) {
      Object.assign(player, { currentTime: 0 });
      setCurrentTime(0);
    }
  };

  const resetHideTimer = useCallback(() => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    if (!activeMenu && !isLocked) {
      hideControlsTimer.current = setTimeout(() => {
        if (isPlaying) {
          setShowControls(false);
          Animated.timing(controlsOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start();
        }
      }, 4000);
    }
  }, [isPlaying, activeMenu, isLocked, controlsOpacity]);

  const toggleControls = useCallback(() => {
    if (isLocked) {
      setShowUnlockButton(true);
      if (lockUnlockTimer.current) clearTimeout(lockUnlockTimer.current);
      lockUnlockTimer.current = setTimeout(() => {
        setShowUnlockButton(false);
      }, 3000);
      return;
    }

    if (showControls) {
      setShowControls(false);
      Animated.timing(controlsOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start();
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    } else {
      setShowControls(true);
      Animated.timing(controlsOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
      resetHideTimer();
    }
  }, [showControls, isLocked, controlsOpacity, resetHideTimer]);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, [resetHideTimer]);

  useEffect(() => {
    if (isBuffering && !isPlaying) {
      const int = setInterval(() => {
        setBufferPercent((p) => Math.min(p + 5, 99));
      }, 200);
      return () => clearInterval(int);
    } else {
      setBufferPercent(0);
    }
  }, [isBuffering, isPlaying]);

  const handlePlayPause = () => {
    if (!player) return;
    if (isPlaying) player.pause();
    else player.play();
    resetHideTimer();
  };

  const handleSkip = (seconds: number) => {
    if (!player) return;
    const target = Math.max(0, Math.min(currentTime + seconds, duration));
    Object.assign(player, { currentTime: target });
    setCurrentTime(target);
    resetHideTimer();
  };

  // Scrubber PanResponder with precision touch tracking
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          setIsScrubbing(true);
          const locationX = evt.nativeEvent.locationX;
          const pageX = evt.nativeEvent.pageX;
          trackPageXOffsetRef.current = pageX - locationX;

          if (trackWidthRef.current > 0 && duration > 0) {
            const percent = Math.max(0, Math.min(locationX / trackWidthRef.current, 1));
            setScrubTime(percent * duration);
          }
        },
        onPanResponderMove: (evt) => {
          const pageX = evt.nativeEvent.pageX;
          const relativeX = pageX - trackPageXOffsetRef.current;
          if (trackWidthRef.current > 0 && duration > 0) {
            const percent = Math.max(0, Math.min(relativeX / trackWidthRef.current, 1));
            setScrubTime(percent * duration);
          }
        },
        onPanResponderRelease: (evt) => {
          const pageX = evt.nativeEvent.pageX;
          const relativeX = pageX - trackPageXOffsetRef.current;
          let target = currentTime;
          if (trackWidthRef.current > 0 && duration > 0) {
            const percent = Math.max(0, Math.min(relativeX / trackWidthRef.current, 1));
            target = percent * duration;
          }
          if (player) {
            Object.assign(player, { currentTime: target });
          }
          setCurrentTime(target);
          setIsScrubbing(false);
          onVideoEvent?.('seeked', target, duration || 0);
          resetHideTimer();
        },
        onPanResponderTerminate: () => {
          setIsScrubbing(false);
        },
      }),
    [duration, player, currentTime, resetHideTimer, onVideoEvent]
  );

  const displayTime = isScrubbing ? scrubTime : currentTime;
  const progressPercent = duration > 0 ? (displayTime / duration) * 100 : 0;

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <WebStyleSpinner size={56} />
        <Text style={styles.loadingText}>Resolving sources...</Text>
      </View>
    );
  }

  if (error || !activeSource) {
    return (
      <View style={styles.centerContainer}>
        <Icon name="error-warning-line" size={48} color="rgba(255,255,255,0.5)" />
        <Text style={styles.errorText}>{error || 'Stream unavailable'}</Text>
        <TouchableOpacity style={styles.btn} onPress={onClose}>
          <Text style={styles.btnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        allowsPictureInPicture={false}
        nativeControls={false}
        contentFit="contain"
      />

      {/* Subtitles Overlay */}
      {activeCue && (
        <View style={styles.subtitleContainer} pointerEvents="none">
          <Text style={styles.subtitleText}>{activeCue.text}</Text>
        </View>
      )}

      {/* Screen Touch Overlay */}
      <TouchableWithoutFeedback onPress={toggleControls}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>

      {/* Floating Unlock Button when screen is locked */}
      {isLocked && showUnlockButton && (
        <View style={styles.lockedOverlay} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.unlockBtn}
            activeOpacity={0.8}
            onPress={() => {
              setIsLocked(false);
              setShowUnlockButton(false);
              setShowControls(true);
              Animated.timing(controlsOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
            }}
          >
            <View style={styles.unlockBtnContent}>
              <Icon name="lock-unlock-line" size={24} color="#00D2FF" />
              <Text style={styles.unlockBtnText}>Tap to Unlock</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Main Controls Overlay Container */}
      {!isLocked && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {/* Gradient Backdrop (fades with controlsOpacity) */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: controlsOpacity }]} pointerEvents="none">
            <LinearGradient
              colors={['rgba(0,0,0,0.85)', 'transparent', 'transparent', 'rgba(0,0,0,0.9)']}
              locations={[0, 0.25, 0.6, 1]}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          {/* 1. TOP BAR (Fades with controlsOpacity) */}
          <Animated.View
            style={[styles.topBar, { paddingTop: Math.max(insets.top, 16), opacity: controlsOpacity }]}
            pointerEvents={showControls ? 'box-none' : 'none'}
          >
            <View style={styles.topBarLeft}>
              {!hideBackButton && (
                <TouchableOpacity onPress={handleClose} activeOpacity={0.7} style={styles.nakedIconBtn}>
                  <Icon name="arrow-left-s-line" size={30} color="#fff" />
                </TouchableOpacity>
              )}

              <View style={{ justifyContent: 'center', marginLeft: 12 }}>
                <Text style={styles.titleTextSmall} numberOfLines={1}>
                  {item.title}
                </Text>
                {mediaType === 'tv' && (
                  <Text style={styles.subtitleTextSmall} numberOfLines={1}>
                    {`S${currentSeason}:E${currentEpisode} ${currentEpisodeTitle ? `· ${currentEpisodeTitle}` : ''}`}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.topBarRight}>
              {/* Lock Button */}
              <TouchableOpacity
                onPress={() => {
                  setIsLocked(true);
                  setShowControls(false);
                  Animated.timing(controlsOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
                }}
                activeOpacity={0.7}
                style={styles.nakedIconBtn}
              >
                <Icon name="lock-line" size={22} color="#fff" />
              </TouchableOpacity>

              {/* PiP Button */}
              <TouchableOpacity onPress={() => {}} activeOpacity={0.7} style={styles.nakedIconBtn}>
                <Icon name="picture-in-picture-line" size={22} color="#fff" />
              </TouchableOpacity>

              {/* Watch Party Toggle Button */}
              {isWatchParty && onWatchPartyToggle && (
                <TouchableOpacity
                  onPress={onWatchPartyToggle}
                  activeOpacity={0.7}
                  style={[styles.nakedQualityBtn, { marginRight: 8 }]}
                >
                  <Icon name="group-line" size={16} color="#00D2FF" style={{ marginRight: 4 }} />
                  <Text style={styles.nakedQualityText}>Party</Text>
                </TouchableOpacity>
              )}

              {/* Quality Dropdown Button */}
              <TouchableOpacity onPress={() => setActiveMenu('quality')} activeOpacity={0.7} style={styles.nakedQualityBtn}>
                <Icon name="hd-line" size={16} color="#00D2FF" style={{ marginRight: 4 }} />
                <Text style={styles.nakedQualityText}>
                  {sources[sourceIndex]?.quality || `360p`}
                </Text>
                <Icon name="arrow-down-s-line" size={16} color="rgba(255,255,255,0.7)" style={{ marginLeft: 2 }} />
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* 2. CENTER CONTROLS (Fades with controlsOpacity) */}
          <Animated.View
            style={[styles.centerControls, { opacity: controlsOpacity }]}
            pointerEvents={showControls ? 'box-none' : 'none'}
          >
            <TouchableOpacity onPress={() => handleSkip(-10)} activeOpacity={0.7} style={styles.centerIconTouch}>
              <Icon name="replay-10-line" size={46} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity onPress={handlePlayPause} activeOpacity={0.7} style={styles.centerPlayTouch}>
              {isBuffering ? (
                <WebStyleSpinner percent={bufferPercent} size={64} />
              ) : (
                <Icon name={isPlaying ? 'pause-fill' : 'play-fill'} size={64} color="#fff" />
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => handleSkip(10)} activeOpacity={0.7} style={styles.centerIconTouch}>
              <Icon name="forward-10-line" size={46} color="#fff" />
            </TouchableOpacity>
          </Animated.View>

          {/* 3. PLAYBACK TRACK & TIMESTAMPS */}
          <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]} pointerEvents="box-none">
            {/* Top of Track Bar Row: Restart on left, Skip button & Time counter on right */}
            <View style={styles.trackTopRow} pointerEvents="box-none">
              {/* Left side: Restart button (Fades with controlsOpacity) */}
              <Animated.View style={[styles.trackTopLeft, { opacity: controlsOpacity }]} pointerEvents={showControls ? 'box-none' : 'none'}>
                <TouchableOpacity onPress={handleRestart} activeOpacity={0.7} style={styles.nakedActionBtn}>
                  <Icon name="skip-back-mini-line" size={16} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={styles.nakedActionText}>RESTART</Text>
                </TouchableOpacity>
              </Animated.View>

              {/* Right side: Skip Intro/Outro button (PERSISTENT!) + Time counter (fades with controlsOpacity) */}
              <View style={styles.trackTopRight} pointerEvents="box-none">
                {/* Skip Intro / Outro button sitting right beside counter */}
                <Animated.View
                  style={{
                    opacity: skipAnim,
                    transform: [{ translateY: skipTranslateY }],
                    marginRight: 10,
                  }}
                  pointerEvents={activeSkipSegment ? 'auto' : 'none'}
                >
                  <TouchableOpacity onPress={handleSkipSegment} activeOpacity={0.8} style={styles.whiteSkipBtn}>
                    <Text style={styles.whiteSkipText}>{activeSkipSegment || 'SKIP INTRO'}</Text>
                    <Icon name="skip-forward-mini-fill" size={16} color="#000" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </Animated.View>

                {/* Time counter display (Fades with controlsOpacity) */}
                <Animated.Text style={[styles.trackTimeTopText, { opacity: controlsOpacity }]}>
                  {formatTime(displayTime)} / {formatTime(duration)}
                </Animated.Text>
              </View>
            </View>

            {/* Playback Scrubber Track (Fades with controlsOpacity) */}
            <Animated.View style={[styles.progressContainer, { opacity: controlsOpacity }]} pointerEvents={showControls ? 'box-none' : 'none'}>
              <View
                style={styles.progressBarTouchTarget}
                onLayout={(e: LayoutChangeEvent) => {
                  trackWidthRef.current = e.nativeEvent.layout.width;
                }}
                {...panResponder.panHandlers}
              >
                {/* Track background */}
                <View style={styles.progressBarBg}>
                  {/* Intro/Recap/Outro Segment Highlight Markers */}
                  {segmentIndicators.map((seg, idx) => (
                    <View
                      key={idx}
                      style={{
                        position: 'absolute',
                        left: `${seg.startPct}%`,
                        width: `${seg.widthPct}%`,
                        height: '100%',
                        backgroundColor: '#FFD700',
                        borderRadius: 2,
                        zIndex: 1,
                        opacity: 0.9,
                      }}
                    />
                  ))}

                  {/* Track fill bar (Cyan Blue) */}
                  <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
                  {/* Solid White Circle Thumb */}
                  <View style={[styles.progressThumb, { left: `${progressPercent}%` }]} />
                </View>
              </View>
            </Animated.View>

            {/* 4. LOWER CONTROLS ROW (Fades with controlsOpacity) */}
            <Animated.View style={[styles.lowerControlsRow, { opacity: controlsOpacity }]} pointerEvents={showControls ? 'box-none' : 'none'}>
              {/* Playback Speed */}
              <TouchableOpacity onPress={() => setActiveMenu('speed')} activeOpacity={0.7} style={styles.nakedControlItem}>
                <Icon name="speed-up-line" size={20} color="#fff" />
                <Text style={styles.nakedControlText}>{`Speed (${playbackSpeed}x)`}</Text>
              </TouchableOpacity>

              {/* Episodes (for TV Series) */}
              {mediaType === 'tv' && (
                <TouchableOpacity onPress={() => setActiveMenu('episodes')} activeOpacity={0.7} style={styles.nakedControlItem}>
                  <Icon name="film-line" size={20} color="#fff" />
                  <Text style={styles.nakedControlText}>Episodes</Text>
                </TouchableOpacity>
              )}

              {/* Subtitles */}
              <TouchableOpacity onPress={() => setActiveMenu('subtitles')} activeOpacity={0.7} style={styles.nakedControlItem}>
                <Icon name="closed-captioning-line" size={20} color="#fff" />
                <Text style={styles.nakedControlText}>
                  {subtitles[selectedSubtitle]?.language || subtitles[selectedSubtitle]?.label || 'Subtitles'}
                </Text>
              </TouchableOpacity>

              {/* Next Episode Button */}
              {mediaType === 'tv' && (
                <TouchableOpacity onPress={handleNextEpisode} activeOpacity={0.7} style={styles.nakedControlItem}>
                  <Icon name="skip-forward-mini-fill" size={20} color="white" />
                  <Text style={[styles.nakedControlText, { color: 'white' }]}>Next Ep.</Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          </View>
        </View>
      )}

      {/* MODALS */}
      <Modal
        visible={activeMenu !== null}
        transparent
        animationType="fade"
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
        onRequestClose={() => setActiveMenu(null)}
      >
        <TouchableWithoutFeedback onPress={() => setActiveMenu(null)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalContent, activeMenu === 'episodes' && styles.modalContentLarge]}>
                {/* Playback Speed Modal */}
                {activeMenu === 'speed' && (
                  <>
                    <Text style={styles.modalTitle}>Playback Speed</Text>
                    <View style={styles.modalRow}>
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                        <TouchableOpacity
                          key={speed}
                          style={[styles.modalOption, playbackSpeed === speed && styles.modalOptionActive]}
                          onPress={() => {
                            setPlaybackSpeed(speed);
                            if (player) player.playbackRate = speed;
                            setActiveMenu(null);
                          }}
                        >
                          <Text style={[styles.modalOptionText, playbackSpeed === speed && { color: '#000' }]}>
                            {speed}x
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* Subtitles Modal */}
                {activeMenu === 'subtitles' && (
                  <>
                    <Text style={styles.modalTitle}>Subtitles</Text>
                    <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                      <TouchableOpacity
                        style={[styles.modalOptionRow, selectedSubtitle === -1 && styles.modalOptionRowActive]}
                        onPress={() => {
                          setSelectedSubtitle(-1);
                          setActiveMenu(null);
                        }}
                      >
                        <Text style={[styles.modalOptionText, selectedSubtitle === -1 && { color: '#000' }]}>
                          Off
                        </Text>
                      </TouchableOpacity>
                      {subtitles.map((sub, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={[styles.modalOptionRow, selectedSubtitle === idx && styles.modalOptionRowActive]}
                          onPress={() => {
                            setSelectedSubtitle(idx);
                            setActiveMenu(null);
                          }}
                        >
                          <Text style={[styles.modalOptionText, selectedSubtitle === idx && { color: '#000' }]}>
                            {sub.language || sub.label || `Subtitle ${idx + 1}`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      {subtitles.length === 0 && (
                        <Text style={[styles.modalOptionText, { textAlign: 'center', opacity: 0.6 }]}>
                          No external subtitles found
                        </Text>
                      )}
                    </ScrollView>
                  </>
                )}

                {/* Quality Modal */}
                {activeMenu === 'quality' && (
                  <>
                    <Text style={styles.modalTitle}>Video Quality</Text>
                    <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                      {sources.map((src, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={[styles.modalOptionRow, sourceIndex === idx && styles.modalOptionRowActive]}
                          onPress={() => {
                            setSourceIndex(idx);
                            setActiveMenu(null);
                            setIsBuffering(true);
                          }}
                        >
                          <Text style={[styles.modalOptionText, sourceIndex === idx && { color: '#000' }]}>
                            {`${src.quality || `Source ${idx + 1}`} (${src.type || 'mp4'})`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                {/* Episodes Modal */}
                {activeMenu === 'episodes' && (
                  <>
                    <View style={styles.episodesHeader}>
                      <Text style={styles.modalTitle}>Select Episode</Text>
                      <TouchableOpacity onPress={() => setActiveMenu(null)} style={styles.modalCloseBtn}>
                        <Icon name="close-line" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>

                    {/* Season Tabs */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.seasonsTabScroll}>
                      {seasons.map((s) => (
                        <TouchableOpacity
                          key={s.id}
                          style={[
                            styles.seasonTab,
                            selectedSeasonForEpisodes === s.seasonNumber && styles.seasonTabActive,
                          ]}
                          onPress={() => setSelectedSeasonForEpisodes(s.seasonNumber)}
                        >
                          <Text
                            style={[
                              styles.seasonTabText,
                              selectedSeasonForEpisodes === s.seasonNumber && { color: '#000' },
                            ]}
                          >
                            {`Season ${s.seasonNumber}`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    {/* Episode List */}
                    {loadingEpisodes ? (
                      <View style={{ padding: 24, alignItems: 'center' }}>
                        <ActivityIndicator size="small" color="#00D2FF" />
                      </View>
                    ) : (
                      <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
                        {(episodesMap[selectedSeasonForEpisodes] || []).map((ep) => {
                          const isCurrent =
                            selectedSeasonForEpisodes === currentSeason && ep.episodeNumber === currentEpisode;
                          return (
                            <TouchableOpacity
                              key={ep.id}
                              style={[styles.episodeCard, isCurrent && styles.episodeCardActive]}
                              onPress={() => {
                                setCurrentSeason(selectedSeasonForEpisodes);
                                setCurrentEpisode(ep.episodeNumber);
                                setCurrentEpisodeTitle(ep.name);
                                setActiveMenu(null);
                              }}
                            >
                              <Image
                                source={{ uri: tmdbImage(ep.stillPath, 'w300') }}
                                style={styles.episodeStill}
                                contentFit="cover"
                              />
                              <View style={styles.episodeInfo}>
                                <Text
                                  style={[styles.episodeTitle, isCurrent && { color: '#00D2FF' }]}
                                  numberOfLines={1}
                                >
                                  {`${ep.episodeNumber}. ${ep.name}`}
                                </Text>
                                <Text style={styles.episodeOverview} numberOfLines={2}>
                                  {ep.overview || 'No overview available.'}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.body,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 16,
  },
  errorText: {
    ...typography.body,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 16,
    marginBottom: 24,
  },
  btn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  btnText: {
    ...typography.button,
    color: '#fff',
  },
  subtitleContainer: {
    position: 'absolute',
    bottom: '22%',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 5,
  },
  subtitleText: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    textAlign: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 36,
    paddingTop: 16,
    zIndex: 10,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  nakedIconBtn: {
    padding: 6,
  },
  nakedQualityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
  },
  nakedQualityText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  titleTextSmall: {
    ...typography.headline,
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subtitleTextSmall: {
    ...typography.body,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
    fontSize: 13,
  },
  centerControls: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 56,
  },
  centerIconTouch: {
    padding: 12,
  },
  centerPlayTouch: {
    padding: 12,
  },
  bottomBar: {
    paddingHorizontal: 36,
    paddingBottom: 16,
    zIndex: 10,
  },
  trackTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  trackTopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nakedActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  nakedActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  whiteSkipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  whiteSkipText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '800',
  },
  trackTimeTopText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressBarTouchTarget: {
    height: 30,
    justifyContent: 'center',
  },
  progressBarBg: {
    height: 3.5,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 2,
    position: 'relative',
    justifyContent: 'center',
  },
  progressBarFill: {
    height: 3.5,
    backgroundColor: '#00D2FF',
    borderRadius: 2,
    position: 'absolute',
    zIndex: 2,
  },
  progressThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    position: 'absolute',
    marginLeft: -7,
    zIndex: 3,
    elevation: 3,
    shadowColor: '#00D2FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  lowerControlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
  },
  nakedControlItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  nakedControlText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  lockedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  unlockBtn: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  unlockBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 210, 255, 0.5)',
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  unlockBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    maxWidth: 420,
    backgroundColor: 'rgba(18,18,18,0.96)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  modalContentLarge: {
    maxWidth: 520,
  },
  modalTitle: {
    ...typography.headline,
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center',
  },
  modalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  modalOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  modalOptionActive: {
    backgroundColor: '#00D2FF',
  },
  modalOptionText: {
    ...typography.button,
    color: '#fff',
    fontSize: 14,
  },
  modalOptionRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  modalOptionRowActive: {
    backgroundColor: '#00D2FF',
  },
  episodesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seasonsTabScroll: {
    marginBottom: 12,
    marginTop: 4,
  },
  seasonTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginRight: 8,
  },
  seasonTabActive: {
    backgroundColor: '#00D2FF',
  },
  seasonTabText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  episodeCard: {
    flexDirection: 'row',
    padding: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 8,
    alignItems: 'center',
  },
  episodeCardActive: {
    borderWidth: 1,
    borderColor: '#00D2FF',
    backgroundColor: 'rgba(0, 210, 255, 0.1)',
  },
  episodeStill: {
    width: 84,
    height: 50,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  episodeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  episodeTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  episodeOverview: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    lineHeight: 15,
  },
});

export default CustomPlayer;
