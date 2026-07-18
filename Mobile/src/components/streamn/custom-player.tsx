import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  ScrollView,
  Modal,
  AppState,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { BlurView } from 'expo-blur';
import Icon from 'react-native-remix-icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { MediaSummary, MediaType, tmdbImage } from '@/services/media';
import { fetchStreamSources, SourceItem, SubtitleItem } from '@/services/stream-source';
import { typography, colors } from '@/constants/theme';

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
      currentCue.text += (currentCue.text ? '\n' : '') + line;
    }
  }
  if (currentCue) cues.push(currentCue);
  return cues;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (num: number) => String(num).padStart(2, "0");
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

export default function CustomPlayer({
  mediaType,
  mediaId,
  season = 1,
  episode = 1,
  item,
  onClose,
  fileSizeRange,
  isWatchParty = false,
}: CustomPlayerProps) {
  const insets = useSafeAreaInsets();
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceIndex, setSourceIndex] = useState(0);

  const [showControls, setShowControls] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  
  const [activeMenu, setActiveMenu] = useState<'subtitles' | 'speed' | 'quality' | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const skipButtonOpacity = useRef(new Animated.Value(0)).current;
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);

  const [vttCues, setVttCues] = useState<VTTCue[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState<number>(0);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [bufferPercent, setBufferPercent] = useState(0);
  const [progressWidth, setProgressWidth] = useState(0);
  const [volumeWidth, setVolumeWidth] = useState(0);

  const [introDbSegments, setIntroDbSegments] = useState<IntroDbMediaRecord | null>(null);
  const [hasSkippedMovieCredits, setHasSkippedMovieCredits] = useState(false);

  useEffect(() => {
    let active = true;
    fetchStreamSources(mediaType, mediaId, season, episode)
      .then((data) => {
        if (!active) return;
        if (data.sources && data.sources.length > 0) {
          setSources(data.sources);
          setSubtitles(data.subtitles || []);
        } else {
          setError("No streams available.");
        }
      })
      .catch((err) => {
        if (active) setError(err.message || "Failed to load stream.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    // Fetch IntroDB
    const introDbUrl = new URL("https://api.theintrodb.org/v3/media");
    introDbUrl.searchParams.set("tmdb_id", String(mediaId));
    if (mediaType === "tv") {
      introDbUrl.searchParams.set("season", String(season));
      introDbUrl.searchParams.set("episode", String(episode));
    }
    
    fetch(introDbUrl.toString(), { headers: { Accept: "application/json" } })
      .then(res => res.json())
      .then(payload => {
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

    return () => { active = false; };
  }, [mediaType, mediaId, season, episode]);

  const activeSource = sources[sourceIndex];

  const tryNextSource = useCallback(() => {
    if (sourceIndex < sources.length - 1) {
      setSourceIndex(sourceIndex + 1);
      setIsBuffering(true);
    } else {
      setError("The sources are currently down.");
      setIsBuffering(false);
    }
  }, [sourceIndex, sources]);

  const videoSource = useMemo(() => {
    if (!activeSource?.url) return null;

    const cleanedUrl = activeSource.url.replace(/(https?:\/\/[^/]+)\/\/+/g, "$1/");
    const isHls = cleanedUrl.includes(".m3u8") || activeSource.type === "hls" || activeSource.type === "m3u8";
    const backendUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'; // Default to localhost if missing

    const videoProxyUrl = process.env.EXPO_PUBLIC_VIDEO_PROXY_URL || `${backendUrl}/api/proxy/video`;

    // Use proxy for MP4 streams to get the hev1 -> hvc1 conversion on iOS
    const proxyUrl = isHls ? cleanedUrl : `${videoProxyUrl}?url=${encodeURIComponent(cleanedUrl)}`;

    return {
      uri: proxyUrl,
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
        "Accept": "video/mp4,video/*;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    };
  }, [activeSource]);

  const player = useVideoPlayer(videoSource, (player) => {
    player.play();
  });

  useEffect(() => {
    if (!player) return;

    const timeUpdateSub = player.addListener('timeUpdate', (e) => {
      setCurrentTime(e.currentTime);
      setDuration(player.duration || 0);
    });

    const statusSub = player.addListener('statusChange', (e) => {
      if (e.status === 'readyToPlay') {
        setIsBuffering(false);
        setDuration(player.duration || 0);
      } else if (e.status === 'loading') {
        setIsBuffering(true);
      } else if (e.status === 'error') {
        tryNextSource();
      }
    });

    const playingSub = player.addListener('playingChange', (e) => {
      setIsPlaying(e.isPlaying);
      if (e.isPlaying) setIsBuffering(false);
    });

    return () => {
      timeUpdateSub.remove();
      statusSub.remove();
      playingSub.remove();
    };
  }, [player, tryNextSource]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && player) {
        try { player.pause(); } catch (e) {}
      }
    });
    return () => {
      sub.remove();
      try { player?.pause(); } catch (e) {}
    };
  }, [player]);

  useEffect(() => {
    const fetchVtt = async () => {
      if (!subtitles[selectedSubtitle]) {
        setVttCues([]);
        return;
      }
      try {
        const res = await fetch(subtitles[selectedSubtitle].url);
        const text = await res.text();
        setVttCues(parseVTT(text));
      } catch (err) {
        console.error("Failed to load VTT", err);
      }
    };
    fetchVtt();
  }, [selectedSubtitle, subtitles]);

  const activeCue = useMemo(() => {
    return vttCues.find(cue => currentTime >= cue.start && currentTime <= cue.end);
  }, [vttCues, currentTime]);

  const activeSkipSegment = useMemo(() => {
    if (!introDbSegments || duration === 0) return null;
    const allSegments = [
      ...introDbSegments.intro.map(s => ({ ...s, type: 'Skip Intro' })),
      ...introDbSegments.recap.map(s => ({ ...s, type: 'Skip Recap' })),
      ...introDbSegments.credits.map(s => ({ ...s, type: 'Skip Credits' })),
    ];
    for (const seg of allSegments) {
      if (mediaType === 'movie' && seg.type === 'Skip Credits' && hasSkippedMovieCredits) continue;
      const match = findActiveSegment([seg], currentTime, duration);
      if (match) return seg.type;
    }
    return null;
  }, [introDbSegments, currentTime, duration, mediaType, hasSkippedMovieCredits]);

  useEffect(() => {
    Animated.timing(skipButtonOpacity, {
      toValue: activeSkipSegment ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [activeSkipSegment, skipButtonOpacity]);

  const handleSkipSegment = () => {
    if (!introDbSegments || !activeSkipSegment || !player) return;
    const allSegments = [
      ...introDbSegments.intro.map(s => ({ ...s, type: 'Skip Intro' })),
      ...introDbSegments.recap.map(s => ({ ...s, type: 'Skip Recap' })),
      ...introDbSegments.credits.map(s => ({ ...s, type: 'Skip Credits' })),
    ];
    for (const seg of allSegments) {
      const match = findActiveSegment([seg], currentTime, duration);
      if (match && seg.endMs) {
        const target = seg.endMs / 1000;
        Object.assign(player, { currentTime: target });
        if (mediaType === 'movie' && seg.type === 'Skip Credits') {
          setHasSkippedMovieCredits(true);
        }
        break;
      }
    }
  };

  const resetHideTimer = useCallback(() => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    if (!showInfo && !activeMenu) {
      hideControlsTimer.current = setTimeout(() => {
        if (isPlaying) {
          setShowControls(false);
          Animated.timing(controlsOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start();
        }
      }, 4000);
    }
  }, [isPlaying, showInfo, activeMenu, controlsOpacity]);

  const toggleControls = useCallback(() => {
    if (showControls) {
      setShowControls(false);
      Animated.timing(controlsOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start();
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    } else {
      setShowControls(true);
      Animated.timing(controlsOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
      resetHideTimer();
    }
  }, [showControls, controlsOpacity, resetHideTimer]);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, [resetHideTimer]);

  useEffect(() => {
    if (isBuffering && !isPlaying) {
      const int = setInterval(() => {
        setBufferPercent(p => Math.min(p + 5, 99));
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
    resetHideTimer();
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Finding best sources...</Text>
      </View>
    );
  }

  if (error || !activeSource) {
    return (
      <View style={styles.centerContainer}>
        <Icon name="error-warning-line" size={48} color="rgba(255,255,255,0.5)" />
        <Text style={styles.errorText}>{error || "Stream unavailable"}</Text>
        <TouchableOpacity style={styles.btn} onPress={onClose}>
          <Text style={styles.btnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <VideoView
        style={{ width: '100%', height: '100%', position: 'absolute' }}
        player={player}
        allowsPictureInPicture={false}
        nativeControls={false}
        contentFit="contain"
      />

      {activeCue && (
        <View style={styles.subtitleContainer} pointerEvents="none">
          <Text style={styles.subtitleText}>{activeCue.text}</Text>
        </View>
      )}

      <TouchableWithoutFeedback onPress={toggleControls}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>

      <Animated.View style={[StyleSheet.absoluteFill, { opacity: controlsOpacity }]} pointerEvents={showControls ? 'box-none' : 'none'}>
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'transparent', 'transparent', 'rgba(0,0,0,0.9)']}
          locations={[0, 0.2, 0.6, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Top Bar */}
        <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) }]}>
          <View style={styles.topBarLeft}>
            <TouchableOpacity onPress={onClose} activeOpacity={0.8}>
              <BlurView intensity={20} tint="light" style={styles.glassBtn}>
                <Icon name="close-line" size={24} color="#fff" />
              </BlurView>
            </TouchableOpacity>

            <View style={{ justifyContent: 'center', marginLeft: 8 }}>
              <Text style={styles.titleTextSmall}>{item.title}</Text>
              {mediaType === 'tv' && (
                <Text style={styles.subtitleTextSmall}>{`S${season} E${episode}`}</Text>
              )}
            </View>
          </View>
          <View style={styles.topBarRight}>
            <View style={[styles.glassPill, { paddingHorizontal: 12 }]}>
              <TouchableOpacity onPress={() => { if(player) player.muted = !player.muted; }} activeOpacity={0.8}>
                <Icon name={player?.muted ? "volume-mute-line" : "volume-up-line"} size={20} color="#fff" />
              </TouchableOpacity>
              <View 
                style={styles.volumeTrack}
                onLayout={(e) => setVolumeWidth(e.nativeEvent.layout.width)}
                onStartShouldSetResponder={() => true}
                onResponderMove={(e) => {
                  if (volumeWidth > 0 && player) {
                    const vol = Math.max(0, Math.min(1, e.nativeEvent.locationX / volumeWidth));
                    player.volume = vol;
                    player.muted = vol === 0;
                  }
                }}
                onResponderRelease={(e) => {
                  if (volumeWidth > 0 && player) {
                    const vol = Math.max(0, Math.min(1, e.nativeEvent.locationX / volumeWidth));
                    player.volume = vol;
                    player.muted = vol === 0;
                  }
                }}
              >
                <View style={[styles.volumeFill, { width: player?.muted ? '0%' : `${(player?.volume || 1) * 100}%` }]} />
                <View style={[styles.volumeThumb, { left: player?.muted ? '0%' : `${(player?.volume || 1) * 100}%` }]} />
              </View>
            </View>
          </View>
        </View>

        {/* Center Controls */}
        <View style={styles.centerControls} pointerEvents="box-none">
          <TouchableOpacity onPress={() => handleSkip(-10)} activeOpacity={0.8}>
            <BlurView intensity={20} tint="light" style={styles.circleBtn}>
              <Icon name="replay-10-line" size={32} color="#fff" />
            </BlurView>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={handlePlayPause} activeOpacity={0.8}>
            <BlurView intensity={20} tint="light" style={styles.playPauseBtn}>
              {isBuffering ? (
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 12, marginTop: 4, fontWeight: 'bold' }}>{bufferPercent}%</Text>
                </View>
              ) : (
                <Icon name={isPlaying ? "pause-fill" : "play-fill"} size={48} color="#fff" />
              )}
            </BlurView>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => handleSkip(10)} activeOpacity={0.8}>
            <BlurView intensity={20} tint="light" style={styles.circleBtn}>
              <Icon name="forward-10-line" size={32} color="#fff" />
            </BlurView>
          </TouchableOpacity>
        </View>

        {/* Bottom Bar */}
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]} pointerEvents="box-none">
          {/* Lower Controls First */}
          <View style={[styles.lowerControls, { marginBottom: 16 }]} pointerEvents="box-none">
                <View style={styles.lowerLeft}>
                  <TouchableOpacity onPress={() => setShowInfo(true)} activeOpacity={0.8}>
                    <BlurView intensity={20} tint="light" style={[styles.glassPill, { paddingHorizontal: 20 }]}>
                      <Text style={styles.glassPillText}>Info</Text>
                    </BlurView>
                  </TouchableOpacity>
                  {isWatchParty && (
                    <TouchableOpacity onPress={() => {}} activeOpacity={0.8}>
                      <BlurView intensity={20} tint="light" style={[styles.glassPill, { marginLeft: 12 }]}>
                        <Icon name="group-line" size={18} color="#fff" style={{ marginRight: 6 }} />
                        <Text style={styles.glassPillText}>Watch Party</Text>
                      </BlurView>
                    </TouchableOpacity>
                  )}
                  
                  <Animated.View style={{ opacity: skipButtonOpacity, marginLeft: 12 }} pointerEvents={activeSkipSegment ? 'auto' : 'none'}>
                    <TouchableOpacity onPress={handleSkipSegment} activeOpacity={0.8}>
                      <BlurView intensity={20} tint="light" style={[styles.glassPill, { paddingHorizontal: 16 }]}>
                        <Icon name="skip-forward-mini-line" size={18} color="#fff" style={{ marginRight: 6 }} />
                        <Text style={styles.glassPillText}>{activeSkipSegment || "Skip"}</Text>
                      </BlurView>
                    </TouchableOpacity>
                  </Animated.View>
                </View>

                <View style={styles.lowerRight}>
                  <TouchableOpacity onPress={() => setActiveMenu('subtitles')} activeOpacity={0.8}>
                    <BlurView intensity={20} tint="light" style={styles.glassBtn}>
                      <Icon name="closed-captioning-line" size={20} color="#fff" />
                    </BlurView>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setActiveMenu('speed')} activeOpacity={0.8}>
                    <BlurView intensity={20} tint="light" style={styles.glassBtn}>
                      <Icon name="speed-up-line" size={20} color="#fff" />
                    </BlurView>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setActiveMenu('quality')} activeOpacity={0.8}>
                    <BlurView intensity={20} tint="light" style={styles.glassBtn}>
                      <Icon name="hd-line" size={20} color="#fff" />
                    </BlurView>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => {}} activeOpacity={0.8}>
                    <BlurView intensity={20} tint="light" style={[styles.glassBtn, { marginRight: 0 }]}>
                      <Icon name="picture-in-picture-line" size={20} color="#fff" />
                    </BlurView>
                  </TouchableOpacity>
                </View>
              </View>
              
              {/* Progress Bar Last */}
              <View style={styles.progressContainer}>
                <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                <View 
                  style={styles.progressBarBg}
                  onLayout={(e) => setProgressWidth(e.nativeEvent.layout.width)}
                  onStartShouldSetResponder={() => true}
                  onResponderMove={(e) => {
                    const locX = e.nativeEvent.locationX;
                    if (progressWidth > 0 && player) {
                      const percent = Math.max(0, Math.min(1, locX / progressWidth));
                      Object.assign(player, { currentTime: percent * duration });
                    }
                  }}
                  onResponderRelease={(e) => {
                    const locX = e.nativeEvent.locationX;
                    if (progressWidth > 0 && player) {
                      const percent = Math.max(0, Math.min(1, locX / progressWidth));
                      Object.assign(player, { currentTime: percent * duration });
                    }
                  }}
                >
                  <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
                  <View style={[styles.progressThumb, { left: `${progressPercent}%` }]} />
                </View>
                <Text style={styles.timeText}>-{formatTime(duration - currentTime)}</Text>
              </View>
        </View>
      </Animated.View>

      {/* Info Popover Modal */}
      <Modal
        visible={showInfo}
        animationType="slide"
        presentationStyle="pageSheet"
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
        onRequestClose={() => setShowInfo(false)}
      >
        <View style={styles.infoModalContainer}>
          <View style={styles.infoModalHeader}>
            <TouchableOpacity onPress={() => setShowInfo(false)} style={styles.infoModalCloseBtn}>
              <Icon name="close-line" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.infoModalContent} showsVerticalScrollIndicator={false}>
            <Image source={{ uri: tmdbImage(item.backdropPath, 'w780') }} style={styles.infoModalImage} contentFit="cover" />
            <Text style={styles.infoModalTitle}>{item.title}</Text>
            <Text style={styles.infoModalMeta}>
              ★ {item.voteAverage?.toFixed(1) || 'N/A'} · {item.year} · {fileSizeRange || 'N/A'}
            </Text>
            <Text style={styles.infoModalDesc}>{item.overview}</Text>
          </ScrollView>
        </View>
      </Modal>

      {/* Popovers */}
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
              <View style={styles.modalContent}>
                {activeMenu === 'speed' && (
                  <>
                    <Text style={styles.modalTitle}>Playback Speed</Text>
                    <View style={styles.modalRow}>
                      {[0.5, 1, 1.5, 2].map(speed => (
                        <TouchableOpacity
                          key={speed}
                          style={[styles.modalOption, playbackSpeed === speed && styles.modalOptionActive]}
                          onPress={() => {
                            setPlaybackSpeed(speed);
                            if (player) player.playbackRate = speed;
                            setActiveMenu(null);
                          }}
                        >
                          <Text style={[styles.modalOptionText, playbackSpeed === speed && { color: '#000' }]}>{speed}x</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
                {activeMenu === 'subtitles' && (
                  <>
                    <Text style={styles.modalTitle}>Subtitles</Text>
                    <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                      {subtitles.map((sub, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={[styles.modalOptionRow, selectedSubtitle === idx && styles.modalOptionRowActive]}
                          onPress={() => { setSelectedSubtitle(idx); setActiveMenu(null); }}
                        >
                          <Text style={[styles.modalOptionText, selectedSubtitle === idx && { color: '#000' }]}>
                            {sub.language || sub.label || `Subtitle ${idx + 1}`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      {subtitles.length === 0 && (
                        <Text style={styles.modalOptionText}>No subtitles available</Text>
                      )}
                    </ScrollView>
                  </>
                )}
                {activeMenu === 'quality' && (
                  <>
                    <Text style={styles.modalTitle}>Quality</Text>
                    <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
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
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

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
    bottom: '15%',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  subtitleText: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    paddingHorizontal: 12,
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
    paddingHorizontal: 48,
    paddingTop: 24,
    zIndex: 10,
  },
  topBarLeft: {
    flexDirection: 'row',
  },
  topBarRight: {
    flexDirection: 'row',
  },
  glassBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  glassPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  glassPillText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  titleTextSmall: {
    ...typography.headline,
    color: '#fff',
    fontSize: 16,
  },
  subtitleTextSmall: {
    ...typography.body,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
    fontSize: 12,
  },
  volumeTrack: {
    width: 80,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    marginLeft: 12,
    justifyContent: 'center',
    paddingVertical: 10, // increase touch area
  },
  volumeFill: {
    height: 4,
    backgroundColor: '#fff',
    borderRadius: 2,
    position: 'absolute',
  },
  volumeThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    position: 'absolute',
    marginLeft: -7,
  },
  centerControls: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 48,
  },
  circleBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  playPauseBtn: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  bottomBar: {
    paddingHorizontal: 48,
    paddingBottom: 24,
    zIndex: 10,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    width: 50,
  },
  progressBarBg: {
    flex: 1,
    height: 20, // touch target
    justifyContent: 'center',
    marginHorizontal: 12,
  },
  progressBarFill: {
    height: 4,
    backgroundColor: '#fff',
    borderRadius: 2,
    position: 'absolute',
  },
  progressThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    position: 'absolute',
    marginLeft: -7,
  },
  lowerControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  lowerLeft: {
    flexDirection: 'row',
  },
  lowerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleText: {
    ...typography.headline,
    color: '#fff',
    fontSize: 20,
  },
  infoModalContainer: {
    flex: 1,
    backgroundColor: '#1E1E1E',
  },
  infoModalHeader: {
    padding: 16,
    alignItems: 'flex-end',
  },
  infoModalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoModalContent: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  infoModalImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginBottom: 24,
  },
  infoModalTitle: {
    ...typography.headline,
    color: '#fff',
    fontSize: 28,
    marginBottom: 8,
  },
  infoModalMeta: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 20,
    fontSize: 14,
  },
  infoModalDesc: {
    ...typography.body,
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    lineHeight: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    maxWidth: 400,
    backgroundColor: 'rgba(30,30,30,0.95)',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  modalTitle: {
    ...typography.headline,
    color: '#fff',
    fontSize: 20,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  modalOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  modalOptionActive: {
    backgroundColor: '#fff',
  },
  modalOptionText: {
    ...typography.button,
    color: '#fff',
  },
  modalOptionRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginBottom: 8,
  },
  modalOptionRowActive: {
    backgroundColor: '#fff',
  },
});
