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
};

type VTTCue = { start: number; end: number; text: string };

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

export default function CustomPlayer({
  mediaType,
  mediaId,
  season = 1,
  episode = 1,
  item,
  onClose,
  fileSizeRange,
}: CustomPlayerProps) {
  const insets = useSafeAreaInsets();
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceIndex, setSourceIndex] = useState(0);

  const [showControls, setShowControls] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);

  const [vttCues, setVttCues] = useState<VTTCue[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState<number>(0);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);

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
    return () => { active = false; };
  }, [mediaType, mediaId, season, episode]);

  const activeSource = sources[sourceIndex];

  const player = useVideoPlayer(activeSource?.url || null, (player) => {
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

  const resetHideTimer = useCallback(() => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    if (!showInfo) {
      hideControlsTimer.current = setTimeout(() => {
        if (isPlaying) {
          setShowControls(false);
          Animated.timing(controlsOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start();
        }
      }, 4000);
    }
  }, [isPlaying, showInfo, controlsOpacity]);

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
        style={StyleSheet.absoluteFill}
        player={player}
        allowsFullscreen={false}
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
            <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
              <Icon name="close-line" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.topBarRight}>
            <BlurView intensity={20} tint="light" style={styles.pillBtn}>
              <Icon name="volume-up-line" size={20} color="#fff" />
              <View style={styles.volumeTrack}>
                <View style={[styles.volumeFill, { width: '80%' }]} />
              </View>
            </BlurView>
          </View>
        </View>

        {/* Center Controls */}
        <View style={styles.centerControls} pointerEvents="box-none">
          <TouchableOpacity onPress={() => handleSkip(-10)} style={styles.circleBtn}>
            <Icon name="replay-10-line" size={32} color="#fff" />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={handlePlayPause} style={styles.playPauseBtn}>
            {isBuffering ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : (
              <Icon name={isPlaying ? "pause-fill" : "play-fill"} size={48} color="#fff" />
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => handleSkip(10)} style={styles.circleBtn}>
            <Icon name="forward-10-line" size={32} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Bottom Bar */}
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {showInfo ? (
            <BlurView intensity={40} tint="dark" style={styles.infoPanel}>
              <View style={styles.infoRow}>
                <Image source={{ uri: tmdbImage(item.backdropPath, 'w500') }} style={styles.infoImage} contentFit="cover" />
                <View style={styles.infoDetails}>
                  <Text style={styles.infoTitle}>{item.title}</Text>
                  <Text style={styles.infoDesc} numberOfLines={3}>{item.overview}</Text>
                  <Text style={styles.infoMeta}>
                    ★ {item.voteAverage?.toFixed(1) || 'N/A'} · {item.year} · {fileSizeRange || 'N/A'}
                  </Text>
                  <View style={styles.infoActions}>
                    <TouchableOpacity style={styles.actionBtnSolid} onPress={() => { setShowInfo(false); player?.play(); }}>
                      <Icon name="play-fill" size={20} color="#000" />
                      <Text style={styles.actionBtnTextDark}>Resume</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </BlurView>
          ) : (
            <>
              {/* Lower Controls First */}
              <View style={[styles.lowerControls, { marginBottom: 16 }]}>
                <View style={styles.lowerLeft}>
                  <TouchableOpacity onPress={() => setShowInfo(true)}>
                    <BlurView intensity={30} tint="light" style={styles.pillBtn}>
                      <Text style={[styles.pillText, { color: '#000', fontWeight: 'bold' }]}>Info</Text>
                    </BlurView>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => {}}>
                    <BlurView intensity={20} tint="dark" style={[styles.pillBtn, { marginLeft: 12 }]}>
                      <Icon name="group-line" size={18} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.pillText}>Watch Party</Text>
                    </BlurView>
                  </TouchableOpacity>
                </View>

                <View style={styles.lowerRight}>
                  <Text style={styles.titleText}>{item.title}</Text>
                  <Text style={styles.subtitleTextSmall}>
                    {mediaType === 'tv' ? `S${season} E${episode}` : item.subtitle || item.year}
                  </Text>
                </View>
              </View>
              
              {/* Progress Bar Last */}
              <View style={styles.progressContainer}>
                <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
                </View>
                <Text style={styles.timeText}>-{formatTime(duration - currentTime)}</Text>
              </View>
            </>
          )}
        </View>
      </Animated.View>
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
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    overflow: 'hidden',
  },
  pillText: {
    ...typography.button,
    color: '#fff',
    fontSize: 15,
  },
  volumeTrack: {
    width: 80,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    marginLeft: 12,
  },
  volumeFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPauseBtn: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
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
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    marginHorizontal: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
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
    alignItems: 'flex-end',
  },
  titleText: {
    ...typography.headline,
    color: '#fff',
    fontSize: 20,
  },
  subtitleTextSmall: {
    ...typography.body,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  infoPanel: {
    borderRadius: 16,
    padding: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  infoRow: {
    flexDirection: 'row',
  },
  infoImage: {
    width: 200,
    height: 112,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  infoDetails: {
    flex: 1,
    marginLeft: 24,
  },
  infoTitle: {
    ...typography.headline,
    color: '#fff',
    fontSize: 24,
    marginBottom: 8,
  },
  infoDesc: {
    ...typography.body,
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  infoMeta: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 16,
  },
  infoActions: {
    flexDirection: 'row',
  },
  actionBtnSolid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  actionBtnTextDark: {
    ...typography.button,
    color: '#000',
    marginLeft: 8,
  },
});
