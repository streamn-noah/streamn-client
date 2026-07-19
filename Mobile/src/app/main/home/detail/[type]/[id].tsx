import React, { useEffect, useState, useRef, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, Modal, FlatList, TextInput, Share, LayoutAnimation, UIManager, Platform, Animated, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import Icon from 'react-native-remix-icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { getMediaDetail, getSeasonEpisodes } from '@/services/tmdb';
import { MediaDetail, tmdbImage } from '@/services/media';
import { fetchStreamSources, getFileSizeRange, SourceItem, prewarmStreamCache, fetchSeasonDownloadSources } from '@/services/stream-source';
import { getWatchProgress, WatchProgress } from '@/services/storage';
import MaskedView from '@react-native-masked-view/masked-view';
import { typography, colors } from '@/constants/theme';
import { useAuth } from '@/components/providers/auth-provider';
import {
  supabase,
  likeMedia,
  unlikeMedia,
  getLikedIds,
  getMyWatchlists,
  isAddedToAnyWatchlist,
  getWatchlistsForMedia,
  addToWatchlist,
  removeFromWatchlist,
  createWatchlist
} from '@/services/supabase';
import { Sheet } from '@/components/ui/sheet';
import * as Clipboard from 'expo-clipboard';
import { WebView } from 'react-native-webview';
import { AuthSheet } from '@/components/ui/auth-sheet';
import MediaRow from '@/components/MediaRow';
import {
  startDownload,
  cancelDownload,
  deleteDownload,
  getDownloadState,
  getDownloadProgress,
  subscribeToDownloads
} from '@/services/download';

const { width, height } = Dimensions.get('window');

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

function runtimeLabel(minutes: number | null) {
  if (!minutes) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${hours ? hours + 'h ' : ''}${mins}m`;
  return `${hours}h ${mins}m`;
}

function detailMetaLine(detail: MediaDetail) {
  const parts: string[] = [];
  if (detail.voteAverage) {
    parts.push(`${detail.voteAverage.toFixed(1)}/10`);
  }
  if (detail.year) parts.push(detail.year.toString());
  const runtime = runtimeLabel(detail.runtime);
  if (runtime) parts.push(runtime);
  if (detail.certification && detail.certification !== "NR") {
    parts.push(detail.certification);
  }
  return parts;
}

const EpisodeAccordionItem = ({ episode, mediaId, isExpanded, onToggle, onPlay, handleDownload, downloadState, downloadProgress }: any) => {
  return (
    <View style={styles.episodeCardContainer}>
      <TouchableOpacity activeOpacity={0.8} style={styles.episodeHeaderRow} onPress={() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        onToggle();
      }}>
        <View style={styles.episodeThumbnailContainer}>
          {episode.stillPath ? (
            <Image source={{ uri: tmdbImage(episode.stillPath, "w200") }} style={styles.episodeThumbnail} contentFit="cover" />
          ) : (
            <View style={[styles.episodeThumbnail, styles.episodeThumbnailEmpty]}>
              <Icon name="film-line" size={20} color="rgba(255,255,255,0.25)" />
            </View>
          )}
          <View style={styles.episodeNumberBadge}>
            <Text style={styles.episodeNumberText}>{episode.episodeNumber}</Text>
          </View>
        </View>

        <View style={styles.episodeInfoContainer}>
          <Text style={styles.episodeName} numberOfLines={2}>{episode.name}</Text>
        </View>

        <View style={styles.episodeChevronContainer}>
          <Icon name={isExpanded ? "arrow-up-s-line" : "arrow-down-s-line"} size={20} color="rgba(255,255,255,0.5)" />
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.episodeExpandedContent}>
          <Text style={styles.episodeExpandedTitle}>{episode.episodeNumber}. {episode.name}</Text>
          <Text style={styles.episodeExpandedOverview}>{episode.overview || "No episode description available."}</Text>

          <View style={styles.episodeExpandedActions}>
            <TouchableOpacity style={styles.episodePlayButton} onPress={onPlay} activeOpacity={0.8}>
              <Icon name="play-fill" size={16} color="#000" />
              <Text style={styles.episodePlayButtonText}>Play</Text>
            </TouchableOpacity>

            {downloadState === 'completed' ? (
              <TouchableOpacity
                style={[styles.episodeDownloadButton, { backgroundColor: 'rgba(84,180,211,0.1)' }]}
                onPress={() => {
                  Alert.alert(
                    "Delete Download",
                    `Are you sure you want to delete Episode ${episode.episodeNumber}?`,
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => deleteDownload('tv', mediaId, episode.seasonNumber, episode.episodeNumber) }
                    ]
                  );
                }}
                activeOpacity={0.8}
              >
                <Icon name="checkbox-circle-fill" size={16} color="#54B4D3" />
              </TouchableOpacity>
            ) : downloadState === 'downloading' ? (
              <TouchableOpacity
                style={styles.episodeDownloadButton}
                onPress={() => cancelDownload('tv', mediaId, episode.seasonNumber, episode.episodeNumber)}
                activeOpacity={0.8}
              >
                <ActivityIndicator size="small" color="#54B4D3" style={{ transform: [{ scale: 0.8 }] }} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.episodeDownloadButton} onPress={() => handleDownload(episode)} activeOpacity={0.8}>
                <Icon name="download-2-line" size={16} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const filterAired = (eps: any[]) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return eps.filter((ep) => {
    if (!ep.airDate) return false;
    const parts = ep.airDate.split("-");
    if (parts.length !== 3) return false;
    const airDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return airDate.getTime() <= now.getTime();
  });
};

const parseSizeToMB = (sizeStr: string): number => {
  if (!sizeStr) return 0;
  const match = sizeStr.match(/^([\d.]+)\s*(GB|MB|KB|B)?$/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = (match[2] || 'MB').toUpperCase();
  if (unit === 'GB') return val * 1024;
  if (unit === 'KB') return val / 1024;
  if (unit === 'B') return val / (1024 * 1024);
  return val; // MB
};

const formatSize = (mb: number): string => {
  if (mb <= 0) return '';
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${Math.round(mb)} MB`;
};

function Episodes({
  initialEpisodes,
  mediaId,
  seasons,
  isPrewarming,
  selectedSeason,
  setSelectedSeason,
  episodes,
  setEpisodes,
  loadingSeason,
  setLoadingSeason,
  detail
}: any) {
  const router = useRouter();
  const [visibleCount, setVisibleCount] = useState(8);
  const [expandedEpisode, setExpandedEpisode] = useState<number | null>(null);
  const [searchEpisode, setSearchEpisode] = useState('');
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);

  // Episode Download states
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloadEpisode, setDownloadEpisode] = useState<any | null>(null);
  const [downloadSources, setDownloadSources] = useState<any[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);

  const fetchSeasonEpisodesList = async (seasonNum: number) => {
    setShowSeasonPicker(false);
    if (seasonNum === selectedSeason) return;

    setSelectedSeason(seasonNum);
    setVisibleCount(8);
    setExpandedEpisode(null);
    setLoadingSeason(true);

    try {
      const eps = await getSeasonEpisodes(mediaId, seasonNum);
      setEpisodes(filterAired(eps));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSeason(false);
    }
  };

  const handleDownloadClick = async (ep: any) => {
    setDownloadEpisode(ep);
    setDownloadModalOpen(true);
    setLoadingSources(true);
    setDownloadSources([]);
    try {
      const res = await fetchStreamSources(
        "tv",
        mediaId,
        ep.seasonNumber,
        ep.episodeNumber,
        false,
        "download"
      );
      if (res.sources) {
        setDownloadSources(res.sources);
      }
    } catch (err) {
      console.error("Failed to fetch download links:", err);
    } finally {
      setLoadingSources(false);
    }
  };

  const searchFilteredEpisodes = searchEpisode.trim()
    ? episodes.filter((ep: any) => ep.name.toLowerCase().includes(searchEpisode.toLowerCase()) || (ep.overview && ep.overview.toLowerCase().includes(searchEpisode.toLowerCase())))
    : episodes;
  const visibleEpisodes = searchFilteredEpisodes.slice(0, visibleCount);
  const hasMore = searchFilteredEpisodes.length > visibleCount;

  return (
    <View style={styles.episodesSection}>
      <Text style={styles.sectionTitle}>Episodes</Text>

      <View style={styles.episodesControlsRow}>
        <View style={styles.searchContainer}>
          <Icon name="search-line" size={16} color="rgba(255,255,255,0.5)" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search episode..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={searchEpisode}
            onChangeText={setSearchEpisode}
          />
        </View>

        <TouchableOpacity style={styles.seasonDropdownButton} onPress={() => setShowSeasonPicker(true)}>
          <Text style={styles.seasonDropdownText}>Season {selectedSeason}</Text>
          <Icon name="arrow-down-s-line" size={16} color="rgba(255,255,255,0.55)" />
        </TouchableOpacity>
      </View>

      <View style={[styles.episodesListContainer, (loadingSeason || isPrewarming) && styles.opacity50]}>
        {isPrewarming && (
          <View style={styles.prewarmOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.prewarmText}>Loading Sources...</Text>
          </View>
        )}

        {visibleEpisodes.map((episode: any) => {
          const dlState = getDownloadState('tv', mediaId, episode.seasonNumber, episode.episodeNumber);
          const dlProgress = getDownloadProgress('tv', mediaId, episode.seasonNumber, episode.episodeNumber);
          return (
            <EpisodeAccordionItem
              key={episode.id}
              episode={episode}
              mediaId={mediaId}
              isExpanded={expandedEpisode === episode.id}
              onToggle={() => setExpandedEpisode(expandedEpisode === episode.id ? null : episode.id)}
              onPlay={() => router.push(`/player/tv/${mediaId}?season=${selectedSeason}&episode=${episode.episodeNumber}` as any)}
              handleDownload={handleDownloadClick}
              downloadState={dlState}
              downloadProgress={dlProgress}
            />
          );
        })}
      </View>

      {hasMore && (
        <TouchableOpacity style={styles.loadMoreButton} onPress={() => setVisibleCount((c) => c + 8)}>
          <Text style={styles.loadMoreText}>Load 8 more</Text>
        </TouchableOpacity>
      )}

      {/* SEASON PICKER MODAL */}
      <Modal visible={showSeasonPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowSeasonPicker(false)} activeOpacity={1}>
          <View style={styles.seasonPickerContainer}>
            <Text style={styles.seasonPickerTitle}>Seasons</Text>
            <ScrollView style={{ maxHeight: height * 0.5 }}>
              {seasons?.map((s: any) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.seasonPickerItem, selectedSeason === s.seasonNumber && styles.seasonPickerItemActive]}
                  onPress={() => fetchSeasonEpisodesList(s.seasonNumber)}
                >
                  <Text style={[styles.seasonPickerText, selectedSeason === s.seasonNumber && styles.seasonPickerTextActive]}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* EPISODE DOWNLOAD MODAL */}
      <Modal visible={downloadModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalCloseIcon} onPress={() => setDownloadModalOpen(false)}>
              <Icon name="close-line" size={24} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>Download Options</Text>
            {downloadEpisode && (
              <Text style={styles.modalSubtitle}>Season {downloadEpisode.seasonNumber}, Episode {downloadEpisode.episodeNumber} · {downloadEpisode.name}</Text>
            )}

            <ScrollView style={{ maxHeight: 300, marginTop: 16 }}>
              {loadingSources ? (
                <View style={styles.centerPad}>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={styles.loadingSourcesText}>Fetching download links...</Text>
                </View>
              ) : downloadSources.length > 0 ? (
                downloadSources.map((s, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.downloadItem}
                    onPress={() => {
                      setDownloadModalOpen(false);
                      startDownload({
                        id: mediaId,
                        mediaType: 'tv',
                        title: detail?.title || 'Unknown Show',
                        overview: detail?.overview || '',
                        posterPath: detail?.posterPath || null,
                        backdropPath: detail?.backdropPath || null,
                        year: detail?.year || '',
                        runtime: detail?.runtime || null,
                        voteAverage: detail?.voteAverage || 0,
                        seasonNumber: downloadEpisode.seasonNumber,
                        episodeNumber: downloadEpisode.episodeNumber,
                        episodeName: downloadEpisode.name,
                        episodeOverview: downloadEpisode.overview,
                        streamUrl: s.url,
                        quality: s.quality || 'Standard',
                        sizeStr: s.size || '',
                      });
                    }}
                  >
                    <View>
                      <Text style={styles.dlQuality}>{s.quality || 'Default Quality'}</Text>
                      {s.size && <Text style={styles.dlSize}>{s.size}</Text>}
                    </View>
                    <View style={styles.dlButtonMini}>
                      <Icon name="download-2-line" size={14} color="#000" />
                      <Text style={styles.dlButtonMiniText}>Download</Text>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.centerPad}>
                  <Icon name="error-warning-line" size={32} color="rgba(255,255,255,0.2)" style={{ marginBottom: 8 }} />
                  <Text style={styles.loadingSourcesText}>No download links available.</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}


export default function MediaDetailModal() {
  const { type, id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, showGoogleSignIn } = useAuth();

  const [detail, setDetail] = useState<MediaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);

  // User Watchlist & Like Database state
  const [watchlists, setWatchlists] = useState<any[]>([]);
  const [inList, setInList] = useState(false);
  const [inListWatchlists, setInListWatchlists] = useState<string[]>([]);
  const [watchlistSheetVisible, setWatchlistSheetVisible] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [showToastAction, setShowToastAction] = useState(false);
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [creatingWatchlist, setCreatingWatchlist] = useState(false);
  const [showNewWatchlistInput, setShowNewWatchlistInput] = useState(false);

  // Series Season Download state
  const [seasonDownloadSheetVisible, setSeasonDownloadSheetVisible] = useState(false);
  const [seasonDownloadEpisodes, setSeasonDownloadEpisodes] = useState<any[]>([]);
  const [loadingSeasonDownload, setLoadingSeasonDownload] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState("1080p");

  // YouTube Trailer Overlay state
  const [trailerVisible, setTrailerVisible] = useState(false);

  // Bounce scale animations
  const listScale = useRef(new Animated.Value(1)).current;
  const likeScale = useRef(new Animated.Value(1)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(20)).current;

  // Stream Sources State
  const [sourceStatus, setSourceStatus] = useState<"loading" | "available" | "unavailable">("loading");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [isPrewarming, setIsPrewarming] = useState(false);
  const [watchProgress, setWatchProgress] = useState<WatchProgress | null>(null);

  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  // Lifted Episode & Season states
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loadingSeason, setLoadingSeason] = useState(false);

  const isMovie = type === 'movie';
  const movieDownloadState = (isMovie && detail) ? getDownloadState('movie', detail.id) : 'none';
  const movieDownloadProgress = (isMovie && detail) ? getDownloadProgress('movie', detail.id) : 0;

  // Download observer state
  const [, setDownloadTrigger] = useState(0);
  useEffect(() => {
    const unsubscribe = subscribeToDownloads(() => {
      setDownloadTrigger((prev) => prev + 1);
    });
    return () => unsubscribe();
  }, []);

  const handleStartMovieDownload = async (source: SourceItem) => {
    if (!detail) return;
    setDownloadModalOpen(false);
    showToast("Starting download...", false);
    startDownload({
      id: detail.id,
      mediaType: 'movie',
      title: detail.title,
      overview: detail.overview,
      posterPath: detail.posterPath,
      backdropPath: detail.backdropPath,
      year: detail.year,
      runtime: detail.runtime,
      voteAverage: detail.voteAverage,
      streamUrl: source.url,
      quality: source.quality || 'Standard',
      sizeStr: source.size || '',
    });
  };


  // Load Media Details and check user states
  useEffect(() => {
    console.log("[MediaDetail] Loaded. Current auth user:", user?.id || "LOGGED_OUT");
    let mounted = true;
    async function loadData() {
      try {
        const data = await getMediaDetail(type as 'movie' | 'tv', Number(id));
        if (mounted) {
          if (type === 'tv' && data && data.seasons && data.seasons.length > 0) {
            const firstSeasonNum = data.seasons[0].seasonNumber === 0 && data.seasons.length > 1
              ? data.seasons[1].seasonNumber
              : data.seasons[0].seasonNumber;
            const fetchedEps = await getSeasonEpisodes(Number(id), firstSeasonNum);
            const filteredEps = filterAired(fetchedEps);
            data.episodes = filteredEps;
            setEpisodes(filteredEps);
            setSelectedSeason(firstSeasonNum);
          }
          setDetail(data);

          const progress = await getWatchProgress(type as 'movie' | 'tv', Number(id));
          setWatchProgress(progress);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadData();
    return () => { mounted = false; };
  }, [type, id]);

  // Sync watchlist & like statuses
  useEffect(() => {
    if (!user) {
      setLiked(false);
      setInList(false);
      setInListWatchlists([]);
      return;
    }

    let isMounted = true;
    async function fetchUserStates() {
      try {
        const [likedIds, watchLists, mediaWatchlists] = await Promise.all([
          getLikedIds(),
          getMyWatchlists(),
          getWatchlistsForMedia(Number(id), type as 'movie' | 'tv')
        ]);

        if (isMounted) {
          setLiked(likedIds.some(row => row.media_id === Number(id) && row.media_type === type));
          setWatchlists(watchLists);
          setInListWatchlists(mediaWatchlists);
          setInList(mediaWatchlists.length > 0);
        }
      } catch (err) {
        console.error("Failed to load user detail states:", err);
      }
    }

    fetchUserStates();
    return () => { isMounted = false; };
  }, [user, id, type]);

  const firstEpisode = detail?.episodes?.[0];
  const season = watchProgress?.seasonNumber ?? firstEpisode?.seasonNumber ?? 1;
  const episode = watchProgress?.episodeNumber ?? firstEpisode?.episodeNumber ?? 1;

  // Probe source availability and fetch download info
  useEffect(() => {
    if (!detail) return;
    let isMounted = true;
    setSourceStatus("loading");
    setSources([]);

    const fetchInitialData = async () => {
      try {
        if (detail.mediaType === "tv") {
          setIsPrewarming(true);
          await prewarmStreamCache("tv", detail.id, season, episode);
          if (isMounted) setIsPrewarming(false);
        }

        const res = await fetchStreamSources(detail.mediaType, detail.id, season, episode, false, "playback");
        if (!isMounted) return;
        if (res.sources && res.sources.length > 0) {
          setSources(res.sources);
          setSourceStatus("available");
        } else {
          setSourceStatus("unavailable");
        }
      } catch (err) {
        if (isMounted) {
          setSourceStatus("unavailable");
          setSources([]);
          setIsPrewarming(false);
        }
      }
    };

    fetchInitialData();

    return () => { isMounted = false; };
  }, [detail, season, episode]);

  const [mainPlayLoading, setMainPlayLoading] = useState(false);

  const handleMainPlay = async () => {
    if (!detail) return;
    setMainPlayLoading(true);
    try {
      await fetchStreamSources(detail.mediaType, detail.id, season, episode, false, "playback");
    } catch (err) {
      console.error(err);
    } finally {
      setMainPlayLoading(false);
      router.push(`/player/${detail.mediaType}/${detail.id}?season=${season}&episode=${episode}` as any);
    }
  };

  const handleShare = async () => {
    if (!detail) return;
    try {
      await Share.share({
        message: `Check out ${detail.title} on Streamn`,
        url: `https://streamn.vercel.app/title/${detail.mediaType}/${detail.id}`
      });
    } catch (error) {
      console.error(error);
    }
  };

  const triggerBounce = (scaleVal: Animated.Value) => {
    scaleVal.setValue(1);
    Animated.sequence([
      Animated.timing(scaleVal, { toValue: 0.8, duration: 100, useNativeDriver: true }),
      Animated.spring(scaleVal, { toValue: 1.25, friction: 3, tension: 40, useNativeDriver: true }),
      Animated.timing(scaleVal, { toValue: 1.0, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  const showToast = (message: string, showAction: boolean = false) => {
    setToastMessage(message);
    setShowToastAction(showAction);
    setToastVisible(true);
    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(toastTranslateY, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();

    setTimeout(() => {
      hideToast();
    }, 4000);
  };

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(toastTranslateY, { toValue: 20, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      setToastVisible(false);
    });
  };

  const handleLikePress = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      showGoogleSignIn(() => {
        handleLikePress();
      });
      return;
    }

    triggerBounce(likeScale);
    setLikeBusy(true);

    if (liked) {
      const ok = await unlikeMedia(detail!.id, detail!.mediaType);
      if (ok) {
        setLiked(false);
        showToast("removed from liked titles", false);
      }
    } else {
      const ok = await likeMedia(detail!, detail!.genres);
      if (ok) {
        setLiked(true);
        showToast("added to liked titles", false);
      }
    }
    setLikeBusy(false);
  };

  const handleMyListPress = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      showGoogleSignIn(() => {
        handleMyListPress();
      });
      return;
    }

    triggerBounce(listScale);

    if (inList) {
      const listIds = [...inListWatchlists];
      setInList(false);
      setInListWatchlists([]);
      for (const listId of listIds) {
        await removeFromWatchlist(listId, detail!.id, detail!.mediaType);
      }
    } else {
      let watchLaterList = watchlists.find(l => l.name.toLowerCase() === "watch later");
      if (!watchLaterList) {
        watchLaterList = await createWatchlist("Watch Later", "private");
        if (watchLaterList) {
          setWatchlists(prev => [watchLaterList, ...prev]);
        }
      }

      if (watchLaterList) {
        const ok = await addToWatchlist(watchLaterList.id, detail!);
        if (ok) {
          setInList(true);
          setInListWatchlists([watchLaterList.id]);
          showToast("added to watch later list", true);
        }
      }
    }
  };

  const handleToggleWatchlistPresence = async (watchlistId: string) => {
    const isAdded = inListWatchlists.includes(watchlistId);
    if (isAdded) {
      const ok = await removeFromWatchlist(watchlistId, detail!.id, detail!.mediaType);
      if (ok) {
        const nextList = inListWatchlists.filter(id => id !== watchlistId);
        setInListWatchlists(nextList);
        setInList(nextList.length > 0);
      }
    } else {
      const ok = await addToWatchlist(watchlistId, detail!);
      if (ok) {
        const nextList = [...inListWatchlists, watchlistId];
        setInListWatchlists(nextList);
        setInList(true);
      }
    }
  };

  const handleCreateNewWatchlist = async () => {
    if (!newWatchlistName.trim()) return;
    setCreatingWatchlist(true);
    try {
      const newList = await createWatchlist(newWatchlistName.trim(), "private");
      if (newList) {
        setWatchlists(prev => [newList, ...prev]);
        setNewWatchlistName("");
        setShowNewWatchlistInput(false);
        const ok = await addToWatchlist(newList.id, detail!);
        if (ok) {
          const nextList = [...inListWatchlists, newList.id];
          setInListWatchlists(nextList);
          setInList(true);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingWatchlist(false);
    }
  };

  // Season download triggers
  const handleSeasonDownloadClick = async () => {
    setSeasonDownloadSheetVisible(true);
    setLoadingSeasonDownload(true);
    setSeasonDownloadEpisodes([]);
    try {
      const res = await fetchSeasonDownloadSources("tv", detail!.id, selectedSeason);
      if (res.episodes) {
        setSeasonDownloadEpisodes(res.episodes);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSeasonDownload(false);
    }
  };

  const availableQualities = useMemo(() => {
    const qualities = new Set<string>();
    for (const ep of seasonDownloadEpisodes) {
      for (const src of ep.sources) {
        if (src.quality) qualities.add(src.quality);
      }
    }
    return Array.from(qualities).sort((a, b) => parseInt(b) - parseInt(a));
  }, [seasonDownloadEpisodes]);

  useEffect(() => {
    if (availableQualities.length > 0 && !availableQualities.includes(selectedQuality)) {
      setSelectedQuality(availableQualities[0]);
    }
  }, [availableQualities, selectedQuality]);

  const filteredSeasonEpisodes = useMemo(() => {
    return seasonDownloadEpisodes.map(ep => {
      let source = ep.sources.find((s: any) => s.quality === selectedQuality);
      if (!source && ep.sources.length > 0) source = ep.sources[0];
      return {
        ...ep,
        selectedSource: source
      };
    });
  }, [seasonDownloadEpisodes, selectedQuality]);

  const totalSeasonSize = useMemo(() => {
    let totalMB = 0;
    for (const ep of filteredSeasonEpisodes) {
      if (ep.selectedSource?.size) {
        totalMB += parseSizeToMB(ep.selectedSource.size);
      }
    }
    return formatSize(totalMB);
  }, [filteredSeasonEpisodes]);

  const handleCopySeasonLinks = async () => {
    const links = filteredSeasonEpisodes
      .map(ep => ep.selectedSource?.url)
      .filter(Boolean)
      .join("\n");
    if (links) {
      await Clipboard.setStringAsync(links);
      alert("Links copied to clipboard!");
    }
  };

  const handleShareSeasonLinks = async () => {
    const links = filteredSeasonEpisodes
      .map(ep => ep.selectedSource?.url)
      .filter(Boolean)
      .join("\n");
    if (links) {
      await Share.share({
        message: links,
        title: `Season ${selectedSeason} Links`
      });
    }
  };

  const fileSizeRange = useMemo(() => {
    return getFileSizeRange(sources);
  }, [sources]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={{ color: '#fff' }}>Failed to load media details.</Text>
        <TouchableOpacity
          style={{ position: 'absolute', right: 16, top: insets.top + 8, zIndex: 50 }}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <BlurView intensity={20} tint="light" style={styles.headerBtn}>
            <Icon name="close-line" size={24} color="#fff" />
          </BlurView>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <View style={styles.container}>
      {/* HEADER (Sticky) */}
      <View style={[styles.stickyHeader, { paddingTop: insets.top }]}>
        <LinearGradient
          colors={['rgba(0,0,0,0.9)', 'rgba(0,0,0,0.4)', 'transparent']}
          style={[StyleSheet.absoluteFill as any, { opacity: Math.max(0, Math.min(scrollY / 50, 1)) }]}
          pointerEvents="none"
        />
        <View style={styles.headerRow}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => router.back()}>
            <View style={styles.headerBtn}>
              <Icon name="arrow-left-line" size={24} color="#fff" />
            </View>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} onPress={handleShare}>
            <View style={styles.headerBtn}>
              <Icon name="share-2-line" size={24} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 80, gap: 44 }}
        bounces={false}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >

        {/* HERO SECTION */}
        <View style={styles.heroSection}>
          <Image
            source={{ uri: tmdbImage(detail.backdropPath || detail.posterPath, 'w1280') }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition="top"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.4)', '#000']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <View style={styles.heroContent}>
            {detail.logoPath ? (
              <Image
                source={{ uri: tmdbImage(detail.logoPath, 'w500') }}
                style={styles.heroLogoImage}
                contentFit="contain"
              />
            ) : (
              <Text style={styles.heroTitleText}>{detail.title}</Text>
            )}
          </View>
        </View>

        {/* INFO & ACTIONS SECTION */}
        <View style={styles.contentSection}>
          {/* Prominent Mobile Buttons */}
          <View style={styles.prominentButtonsContainer}>
            {sourceStatus === 'loading' ? (
              <TouchableOpacity style={[styles.watchNowButton, { backgroundColor: 'rgba(255,255,255,0.7)' }]} disabled>
                <ActivityIndicator size="small" color="rgba(0,0,0,0.7)" />
                <Text style={[styles.watchNowText, { color: 'rgba(0,0,0,0.7)', marginLeft: 8 }]}>Checking source...</Text>
              </TouchableOpacity>
            ) : sourceStatus === 'unavailable' ? (
              <TouchableOpacity style={[styles.watchNowButton, { backgroundColor: 'rgba(255,255,255,0.2)' }]} disabled>
                <Icon name="error-warning-line" size={20} color="rgba(255,255,255,0.5)" />
                <Text style={[styles.watchNowText, { color: 'rgba(255,255,255,0.5)', marginLeft: 8 }]}>Source Unavailable</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.watchNowButton} onPress={handleMainPlay} disabled={mainPlayLoading}>
                {mainPlayLoading ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Icon name="play-fill" size={20} color="#000" />
                )}
                <Text style={[styles.watchNowText, { marginLeft: 8 }]}>
                  {mainPlayLoading ? "Loading..." : watchProgress ? "Continue Watching" : "Watch Now"}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.watchTogetherButton} activeOpacity={0.8}>
              <Icon name="tv-2-line" size={20} color="#fff" />
              <Text style={styles.watchTogetherText}>Watch Together</Text>
            </TouchableOpacity>

            {/* Mobile Action Buttons Grid */}
            <View style={styles.mobileActionsGrid}>
              <View style={styles.actionItem}>
                <TouchableOpacity style={styles.actionIconBtn} onPress={handleMyListPress}>
                  <Animated.View style={{ transform: [{ scale: listScale }] }}>
                    <Icon name={inList ? "check-fill" : "add-line"} size={24} color="#fff" />
                  </Animated.View>
                </TouchableOpacity>
                <Text style={styles.actionLabel}>My List</Text>
              </View>

              <View style={styles.actionItem}>
                <TouchableOpacity style={styles.actionIconBtn} onPress={handleLikePress} disabled={likeBusy}>
                  <Animated.View style={{ transform: [{ scale: likeScale }] }}>
                    <Icon name={liked ? "thumb-up-fill" : "thumb-up-line"} size={24} color="#fff" />
                  </Animated.View>
                </TouchableOpacity>
                <Text style={styles.actionLabel}>Like</Text>
              </View>

              {(isMovie ? sources.length > 0 : true) && (
                <View style={styles.actionItem}>
                  {isMovie ? (
                    movieDownloadState === 'completed' ? (
                      <TouchableOpacity
                        style={styles.actionIconBtn}
                        onPress={() => {
                          Alert.alert(
                            "Delete Download",
                            "Are you sure you want to delete this downloaded movie?",
                            [
                              { text: "Cancel", style: "cancel" },
                              { text: "Delete", style: "destructive", onPress: () => deleteDownload('movie', detail.id) }
                            ]
                          );
                        }}
                      >
                        <Icon name="checkbox-circle-fill" size={24} color="#54B4D3" />
                      </TouchableOpacity>
                    ) : movieDownloadState === 'downloading' ? (
                      <TouchableOpacity
                        style={styles.actionIconBtn}
                        onPress={() => cancelDownload('movie', detail.id)}
                      >
                        <ActivityIndicator size="small" color="#54B4D3" />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.actionIconBtn}
                        onPress={() => setDownloadModalOpen(true)}
                      >
                        <Icon name="download-line" size={24} color="#fff" />
                      </TouchableOpacity>
                    )
                  ) : (
                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={handleSeasonDownloadClick}
                    >
                      <Icon name="download-line" size={24} color="#fff" />
                    </TouchableOpacity>
                  )}
                  <Text style={styles.actionLabel}>
                    {isMovie 
                      ? movieDownloadState === 'completed'
                        ? 'Downloaded'
                        : movieDownloadState === 'downloading'
                          ? `Downloading (${Math.round(movieDownloadProgress * 100)}%)`
                          : 'Download'
                      : `Download S${selectedSeason}`}
                  </Text>
                </View>
              )}

              <View style={styles.actionItem}>
                <TouchableOpacity
                  style={styles.actionIconBtn}
                  onPress={() => {
                    if (detail.trailerKey) {
                      setTrailerVisible(true);
                    } else {
                      alert("No trailer available for this title.");
                    }
                  }}
                >
                  <Icon name="clapperboard-line" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.actionLabel}>Trailer</Text>
              </View>
            </View>
          </View>


          {/* meta row */}
          <View style={{ gap: 12 }}>
            <View style={styles.metaRow}>
              {detail.voteAverage ? (
                <View style={styles.metaItem}>
                  <Icon name="star-fill" size={14} color="#fff" />
                  <Text style={styles.metaTextBold}>{detail.voteAverage.toFixed(1)}</Text>
                  <Text style={styles.metaDot}>·</Text>
                </View>
              ) : null}
              {detail.year ? (
                <View style={styles.metaItem}>
                  <Text style={styles.metaText}>{detail.year}</Text>
                  <Text style={styles.metaDot}>·</Text>
                </View>
              ) : null}
              {detail.certification && detail.certification !== "NR" ? (
                <View style={styles.metaItem}>
                  <View style={styles.certBadge}>
                    <Text style={styles.certText}>{detail.certification}</Text>
                  </View>
                  <Text style={styles.metaDot}>·</Text>
                </View>
              ) : null}
              {detail.runtime ? (
                <View style={styles.metaItem}>
                  <Text style={styles.metaText}>{runtimeLabel(detail.runtime)}</Text>
                  {fileSizeRange && <Text style={styles.metaDot}>·</Text>}
                </View>
              ) : null}
              {fileSizeRange ? (
                <View style={styles.certBadge}>
                  <Text style={styles.certText}>{fileSizeRange}</Text>
                </View>
              ) : null}
            </View>

            {/* Description */}
            <Text style={styles.descriptionText}>{detail.overview}</Text>

            {/* Genres */}
            {detail.genres.length > 0 && (
              <Text style={styles.genresText}>{detail.genres.join(" | ")}</Text>
            )}
          </View>
        </View>

        {/* CAST & CREW SECTION */}
        {detail.cast && detail.cast.length > 0 && (
          <View style={styles.castSection}>
            <View style={styles.castHeaderRow}>
              <Text style={styles.castSectionTitle}>Cast & Crew</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.castScrollContent}
            >
              {detail.cast.map((member: any) => (
                <TouchableOpacity
                  key={member.id}
                  style={styles.castItem}
                  activeOpacity={0.8}
                  onPress={() => {
                    router.push(`/main/home/list?title=${encodeURIComponent(member.name)}&personId=${member.id}` as any);
                  }}
                >
                  <View style={styles.castAvatarWrapper}>
                    {member.profilePath ? (
                      <Image
                        source={{ uri: tmdbImage(member.profilePath, 'w200') }}
                        style={styles.castAvatar}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.castAvatarFallback}>
                        <Icon name="user-3-line" size={32} color="rgba(255,255,255,0.4)" />
                      </View>
                    )}
                  </View>
                  <Text style={styles.castName} numberOfLines={1}>{member.name}</Text>
                  <Text style={styles.castCharacter} numberOfLines={1}>{member.character}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* EPISODES SECTION */}
        {!isMovie && episodes.length > 0 && (
          <Episodes
            initialEpisodes={episodes}
            mediaId={detail.id}
            seasons={detail.seasons}
            isPrewarming={isPrewarming}
            selectedSeason={selectedSeason}
            setSelectedSeason={setSelectedSeason}
            episodes={episodes}
            setEpisodes={setEpisodes}
            loadingSeason={loadingSeason}
            setLoadingSeason={setLoadingSeason}
            detail={detail}
          />
        )}

        {/* MORE LIKE THIS SECTION */}
        {detail.recommendations && detail.recommendations.length > 0 && (
          <MediaRow
            title="More Like This"
            items={detail.recommendations}
            shouldAnimate={true}
            onTitlePress={() => router.push({
              pathname: '/main/home/list',
              params: {
                title: 'More Like This',
                rowKey: 'recommendations',
                mediaId: detail.id,
                mediaType: type
              }
            })}
          />
        )}
      </ScrollView>

      {/* GLOBAL DOWNLOAD MODAL (FOR MOVIE OR FALLBACK) */}
      <Modal visible={downloadModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalCloseIcon} onPress={() => setDownloadModalOpen(false)}>
              <Icon name="close-line" size={24} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>Download Options</Text>
            <Text style={styles.modalSubtitle}>Select a quality to download the media file directly.</Text>

            <ScrollView style={{ maxHeight: 300, marginTop: 16 }}>
              {sources.length > 0 ? (
                sources.map((s, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.downloadItem}
                    onPress={() => handleStartMovieDownload(s)}
                  >
                    <View>
                      <Text style={styles.dlQuality}>{s.quality || 'Unknown Quality'}</Text>
                      <Text style={styles.dlSize}>{s.type || 'mp4'} · {s.size || 'Unknown Size'}</Text>
                    </View>
                    <View style={styles.dlButtonMini}>
                      <Icon name="download-2-line" size={14} color="#000" />
                      <Text style={styles.dlButtonMiniText}>Download</Text>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.centerPad}>
                  <Text style={styles.loadingSourcesText}>No download links available.</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* WATCHLIST PICKER BOTTOM SHEET */}
      <Sheet visible={watchlistSheetVisible} onClose={() => setWatchlistSheetVisible(false)}>
        <Text style={styles.sheetTitle}>Add to Watchlist</Text>

        <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
          {watchlists.map((list) => {
            const isAdded = inListWatchlists.includes(list.id);
            return (
              <TouchableOpacity
                key={list.id}
                style={styles.sheetListItem}
                onPress={() => handleToggleWatchlistPresence(list.id)}
                activeOpacity={0.8}
              >
                <Icon
                  name={isAdded ? "checkbox-circle-fill" : "checkbox-blank-circle-line"}
                  size={20}
                  color={isAdded ? colors.success : "rgba(255,255,255,0.4)"}
                />
                <Text style={styles.sheetListItemText}>{list.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {showNewWatchlistInput ? (
          <View style={styles.newWatchlistInputRow}>
            <TextInput
              style={styles.newWatchlistInput}
              placeholder="Watchlist name..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={newWatchlistName}
              onChangeText={setNewWatchlistName}
              autoFocus
            />
            <TouchableOpacity
              style={styles.newWatchlistCreateBtn}
              onPress={handleCreateNewWatchlist}
              disabled={creatingWatchlist || !newWatchlistName.trim()}
            >
              {creatingWatchlist ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.newWatchlistCreateBtnText}>Create</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowNewWatchlistInput(false)} style={{ padding: 8 }}>
              <Icon name="close-line" size={20} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.newWatchlistBtn}
            onPress={() => setShowNewWatchlistInput(true)}
            activeOpacity={0.8}
          >
            <Icon name="add-line" size={18} color="#fff" />
            <Text style={styles.newWatchlistBtnText}>New Watchlist</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.sheetDoneBtn}
          onPress={() => setWatchlistSheetVisible(false)}
          activeOpacity={0.8}
        >
          <Text style={styles.sheetDoneBtnText}>Done</Text>
        </TouchableOpacity>
      </Sheet>

      {/* TV SEASON DOWNLOAD BOTTOM SHEET */}
      <Sheet visible={seasonDownloadSheetVisible} onClose={() => setSeasonDownloadSheetVisible(false)}>
        <Text style={styles.sheetTitle}>Download Season {selectedSeason}</Text>
        {totalSeasonSize ? (
          <Text style={styles.totalSizeText}>Total Size: {totalSeasonSize}</Text>
        ) : null}

        {loadingSeasonDownload ? (
          <View style={styles.sheetCenterLoader}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.sheetLoaderText}>Fetching season links...</Text>
          </View>
        ) : filteredSeasonEpisodes.length > 0 ? (
          <>
            {/* Quality Selector */}
            {availableQualities.length > 0 && (
              <View style={styles.qualityContainer}>
                <Text style={styles.qualityLabel}>Quality:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.qualityChips}>
                  {availableQualities.map((q) => (
                    <TouchableOpacity
                      key={q}
                      style={[styles.qualityChip, selectedQuality === q && styles.qualityChipActive]}
                      onPress={() => setSelectedQuality(q)}
                    >
                      <Text style={[styles.qualityChipText, selectedQuality === q && styles.qualityChipTextActive]}>{q}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Copy/Share Buttons */}
            <View style={styles.seasonDlActionsRow}>
              <TouchableOpacity style={styles.seasonDlActionBtn} onPress={handleCopySeasonLinks} activeOpacity={0.8}>
                <Icon name="file-copy-line" size={16} color="#000" />
                <Text style={styles.seasonDlActionBtnText}>Copy Links</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.seasonDlActionBtn, { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }]}
                onPress={handleShareSeasonLinks}
                activeOpacity={0.8}
              >
                <Icon name="share-line" size={16} color="#fff" />
                <Text style={[styles.seasonDlActionBtnText, { color: '#fff' }]}>Share Links</Text>
              </TouchableOpacity>
            </View>

            {/* Episodes Scroll List */}
            <ScrollView style={{ maxHeight: 220, marginTop: 12 }} showsVerticalScrollIndicator={false}>
              {filteredSeasonEpisodes.map((ep: any) => (
                <View key={ep.episode} style={styles.seasonDlEpisodeItem}>
                  <Text style={styles.seasonDlEpisodeText}>Episode {ep.episode}</Text>
                  <View style={styles.seasonDlEpisodeMeta}>
                    {ep.selectedSource?.size && (
                      <Text style={styles.seasonDlEpisodeSize}>{ep.selectedSource.size}</Text>
                    )}
                    <View style={styles.seasonDlEpisodeQualityBadge}>
                      <Text style={styles.seasonDlEpisodeQualityText}>{ep.selectedSource?.quality || 'Default'}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          </>
        ) : (
          <View style={styles.sheetCenterLoader}>
            <Icon name="error-warning-line" size={32} color="rgba(255,255,255,0.3)" />
            <Text style={styles.sheetLoaderText}>No batch download links available.</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.sheetDoneBtn}
          onPress={() => setSeasonDownloadSheetVisible(false)}
          activeOpacity={0.8}
        >
          <Text style={styles.sheetDoneBtnText}>Done</Text>
        </TouchableOpacity>
      </Sheet>

      {/* YOUTUBE TRAILER OVERLAY MODAL */}
      <Modal visible={trailerVisible} transparent animationType="fade" onRequestClose={() => setTrailerVisible(false)}>
        <View style={styles.trailerOverlay}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <TouchableOpacity style={styles.trailerCloseBtn} onPress={() => setTrailerVisible(false)} activeOpacity={0.8}>
            <Icon name="close-line" size={28} color="#fff" />
          </TouchableOpacity>

          {detail.trailerKey && (
            <View style={styles.trailerWebviewContainer}>
              <WebView
                style={styles.trailerWebview}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                allowsFullscreenVideo={true}
                mediaPlaybackRequiresUserAction={false}
                allowsInlineMediaPlayback={true}
                source={{ uri: `https://www.youtube.com/embed/${detail.trailerKey}?autoplay=1&playsinline=1` }}
              />
            </View>
          )}
        </View>
      </Modal>

      {/* WATCH LATER TOAST NOTIFICATION */}
      {toastVisible && (
        <Animated.View style={[
          styles.toastContainer,
          {
            opacity: toastOpacity,
            transform: [{ translateY: toastTranslateY }],
            bottom: Platform.OS === 'ios' ? insets.bottom + 12 : 20
          }
        ]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
          {showToastAction && (
            <TouchableOpacity onPress={() => { hideToast(); setWatchlistSheetVisible(true); }} activeOpacity={0.7}>
              <Text style={styles.toastActionText}>change</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {/* GLOBAL AUTH SHEET */}
      <AuthSheet />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  heroSection: {
    width: width,
    height: height * 0.5,
    minHeight: 100,
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  heroLogoImage: {
    width: width * 0.6,
    height: 100,
    maxWidth: 280,
    maxHeight: 96,
  },
  heroTitleText: {
    ...typography.headline,
    fontSize: 40,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  contentSection: {
    paddingHorizontal: 24,
    gap: 36
  },
  prominentButtonsContainer: {
    gap: 12,

  },
  watchNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  watchNowText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  watchTogetherButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  watchTogetherText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 12,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
  },
  metaTextBold: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  metaDot: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: 'bold',
  },
  certBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  certText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 10,
    fontWeight: '700',
  },
  descriptionText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 12,
  },
  genresText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  castSection: {
    gap: 12
  },
  castHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  castSectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  castScrollContent: {
    paddingHorizontal: 16,
  },
  castItem: {
    width: 90,
    marginRight: 16,
    alignItems: 'center',
  },
  castAvatarWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    backgroundColor: '#1e232d',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  castAvatar: {
    width: '100%',
    height: '100%',
  },
  castAvatarFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e232d',
  },
  castName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
    marginBottom: 2,
  },
  castCharacter: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    textAlign: 'center',
    width: '100%',
  },
  mobileActionsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  actionItem: {
    alignItems: 'center',
    gap: 6,
  },
  actionIconBtn: {
    padding: 8,
  },
  actionLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '600',
  },
  episodesSection: {
    paddingHorizontal: 16,
    gap: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  episodesControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d0d0f',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    height: 40,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  seasonDropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d0d0f',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    height: 40,
    paddingHorizontal: 16,
    gap: 8,
  },
  seasonDropdownText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  downloadSeasonButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#0d0d0f',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodesListContainer: {
    gap: 12,
    position: 'relative',
  },
  opacity50: {
    opacity: 0.5,
  },
  prewarmOverlay: {
    ...StyleSheet.absoluteFill as any,
    backgroundColor: 'rgba(0,0,0,0.2)',
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  prewarmText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 8,
  },
  episodeCardContainer: {
    backgroundColor: '#0d0d0f',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  episodeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 16,
  },
  episodeThumbnailContainer: {
    width: 128,
    aspectRatio: 16 / 9,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  episodeThumbnail: {
    width: '100%',
    height: '100%',
  },
  episodeThumbnailEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodeNumberBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  episodeNumberText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  episodeInfoContainer: {
    flex: 1,
  },
  episodeName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  episodeChevronContainer: {
    paddingRight: 4,
  },
  episodeExpandedContent: {
    padding: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  episodeExpandedTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  episodeExpandedOverview: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  episodeExpandedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  episodePlayButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 8,
    gap: 8,
  },
  episodePlayButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  episodeDownloadButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadMoreButton: {
    marginTop: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    alignItems: 'center',
  },
  loadMoreText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  moreLikeThisSection: {
    paddingHorizontal: 16,
    marginTop: 32,
    marginBottom: 32,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    justifyContent: 'flex-start',
  },
  gridItem: {
    width: '33.33%',
    alignItems: 'center',
    marginBottom: 16,
  },
  gridTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  gridMeta: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#121214',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  modalCloseIcon: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 8,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  modalSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '500',
  },
  centerPad: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  loadingSourcesText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 8,
  },
  downloadItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  dlQuality: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  dlSize: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dlButtonMini: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  dlButtonMiniText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  seasonPickerContainer: {
    backgroundColor: '#1a1a1a',
    marginHorizontal: 32,
    borderRadius: 16,
    paddingVertical: 16,
    maxHeight: '60%',
  },
  seasonPickerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  seasonPickerItem: {
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  seasonPickerItemActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  seasonPickerText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    textAlign: 'center',
  },
  seasonPickerTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  // Toast
  toastContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 999,
  },
  toastText: {
    color: '#121214',
    fontSize: 14,
    fontWeight: '600',
  },
  toastActionText: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  // Sheet additions
  sheetTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  totalSizeText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: -8,
    marginBottom: 16,
  },
  sheetListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  sheetListItemText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  newWatchlistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 16,
    gap: 6,
  },
  newWatchlistBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  newWatchlistInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  newWatchlistInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    height: 44,
  },
  newWatchlistCreateBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  newWatchlistCreateBtnText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
  sheetDoneBtn: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  sheetDoneBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },

  // Season Downloads Sheet
  sheetCenterLoader: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  sheetLoaderText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '500',
  },
  qualityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 12,
    gap: 12,
  },
  qualityLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
  },
  qualityChips: {
    gap: 8,
  },
  qualityChip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  qualityChipActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  qualityChipText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  qualityChipTextActive: {
    color: '#000',
    fontWeight: '700',
  },
  seasonDlActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 8,
  },
  seasonDlActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    height: 44,
    borderRadius: 10,
    gap: 8,
  },
  seasonDlActionBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
  seasonDlEpisodeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  seasonDlEpisodeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  seasonDlEpisodeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  seasonDlEpisodeSize: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '500',
  },
  seasonDlEpisodeQualityBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  seasonDlEpisodeQualityText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },

  // Trailer Overlay
  trailerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trailerCloseBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 30,
    right: 20,
    zIndex: 100,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trailerWebviewContainer: {
    width: width - 32,
    aspectRatio: 16 / 9,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  trailerWebview: {
    flex: 1,
    backgroundColor: '#000',
  },
});
