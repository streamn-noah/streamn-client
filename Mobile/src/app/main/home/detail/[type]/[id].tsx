import React, { useEffect, useState, useRef, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Animated, Dimensions, Platform, Modal, FlatList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import Icon from 'react-native-remix-icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import ImageColors from 'react-native-image-colors';
import { getMediaDetail, getSeasonEpisodes } from '@/services/tmdb';
import { MediaDetail, tmdbImage, adjustDominantColor } from '@/services/media';
import { colors } from '@/constants/theme';
import { fetchStreamSources, getFileSizeRange, SourceItem } from '@/services/stream-source';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { WebView } from 'react-native-webview';
import MaskedView from '@react-native-masked-view/masked-view';
import { typography } from '@/constants/theme';
import MediaRow from '@/components/MediaRow';

const { width, height } = Dimensions.get('window');

function runtimeLabel(minutes: number | null) {
  if (!minutes) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

const EpisodeCardItem = ({ ep, handleDownloadEpisode, onPlay }: { ep: any, handleDownloadEpisode: any, onPlay: () => void }) => {
  const [cardColor, setCardColor] = useState('#1a1a1a');

  useEffect(() => {
    let mounted = true;
    const url = tmdbImage(ep.stillPath, 'w500');
    if (url) {
      ImageColors.getColors(url, { fallback: '#1a1a1a', cache: true }).then(c => {
        if (!mounted) return;
        if (c.platform === 'ios') setCardColor(adjustDominantColor(c.primary, '#1a1a1a'));
        else if (c.platform === 'android') setCardColor(adjustDominantColor(c.dominant || '#1a1a1a', '#1a1a1a'));
        else setCardColor(adjustDominantColor(c.dominant || '#1a1a1a', '#1a1a1a'));
      }).catch(() => { });
    }
    return () => { mounted = false; };
  }, [ep.stillPath]);

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPlay}>
      <View style={[styles.epCard, { backgroundColor: 'rgba(0,0,0,0.8)' }]}>
        <Image
          source={{ uri: tmdbImage(ep.stillPath, 'w500') }}
          style={styles.epCardImg}
          contentFit="cover"
        />
        <MaskedView
          style={StyleSheet.absoluteFill}
          maskElement={
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.9)', 'rgba(0,0,0,1)']}
              locations={[0.3, 0.6, 1]}
              style={StyleSheet.absoluteFill}
            />
          }
        >
          <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill]} />
        </MaskedView>
        <View style={styles.epCardContent}>
          <Text style={styles.epCardNumber}>EPISODE {ep.episodeNumber}</Text>
          <Text style={styles.epCardName} numberOfLines={1}>{ep.name}</Text>
          <Text style={styles.epCardOverview} numberOfLines={3}>{ep.overview}</Text>
          <View style={styles.epCardFooter}>
            <Icon name="play-fill" size={16} color="#fff" />
            <Text style={styles.epCardRuntime}>{runtimeLabel(ep.runtime)}</Text>
            <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleDownloadEpisode(ep); }}>
              <Icon name="download-2-line" size={16} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const TrailerCardItem = ({ vid, onPress }: { vid: any, onPress: () => void }) => {
  const [cardColor, setCardColor] = useState('#1a1a1a');

  useEffect(() => {
    let mounted = true;
    const url = `https://img.youtube.com/vi/${vid.key}/hqdefault.jpg`;
    ImageColors.getColors(url, { fallback: '#1a1a1a', cache: true }).then(c => {
      if (!mounted) return;
      if (c.platform === 'ios') setCardColor(adjustDominantColor(c.primary, '#1a1a1a'));
      else if (c.platform === 'android') setCardColor(adjustDominantColor(c.dominant || '#1a1a1a', '#1a1a1a'));
      else setCardColor(adjustDominantColor(c.dominant || '#1a1a1a', '#1a1a1a'));
    }).catch(() => { });
    return () => { mounted = false; };
  }, [vid.key]);

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={[styles.epCard, { backgroundColor: 'rgba(0,0,0,0.8)' }]}>
      <Image
        source={{ uri: `https://img.youtube.com/vi/${vid.key}/hqdefault.jpg` }}
        style={styles.epCardImg}
        contentFit="cover"
      />
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.9)', 'rgba(0,0,0,1)']}
            locations={[0.3, 0.6, 1]}
            style={StyleSheet.absoluteFill}
          />
        }
      >
        <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill]} />
      </MaskedView>
      <View style={styles.epCardContent}>
        <Text style={styles.epCardName} numberOfLines={2}>{vid.name}</Text>
        <View style={styles.epCardFooter}>
          <Icon name="play-fill" size={16} color="#fff" />
          <Text style={styles.epCardRuntime}>{vid.type}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default function MediaDetailModal() {
  const { type, id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [detail, setDetail] = useState<MediaDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Stream Sources State
  const [dominantColor, setDominantColor] = useState<string>('#1a1a1a');
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const fetchSeasonEpisodes = async (seasonNum: number) => {
    if (!detail) return;
    setShowSeasonPicker(false);
    setSelectedSeason(seasonNum);

    const alreadyLoaded = detail.episodes.some((ep: any) => ep.seasonNumber === seasonNum);
    let newEps = detail.episodes;
    if (!alreadyLoaded) {
      const eps = await getSeasonEpisodes(detail.id, seasonNum);
      newEps = [...detail.episodes, ...eps].sort((a, b) => {
        if (a.seasonNumber !== b.seasonNumber) return a.seasonNumber - b.seasonNumber;
        return a.episodeNumber - b.episodeNumber;
      });
      setDetail((prev: any) => prev ? { ...prev, episodes: newEps } : prev);
    }

    setTimeout(() => {
      const index = newEps.findIndex((ep: any) => ep.seasonNumber === seasonNum);
      if (index >= 0 && flatListRef.current) {
        flatListRef.current.scrollToIndex({ index, animated: true, viewPosition: 0 });
      }
    }, 100);
  };

  const loadNextSeason = async () => {
    if (!detail || !detail.seasons || detail.episodes.length === 0) return;
    const currentMaxSeason = Math.max(...detail.episodes.map((ep: any) => ep.seasonNumber));
    const nextSeasonObj = detail.seasons.find((s: any) => s.seasonNumber > currentMaxSeason);
    if (nextSeasonObj) {
      const moreEps = await getSeasonEpisodes(detail.id, nextSeasonObj.seasonNumber);
      setDetail((prev: any) => prev ? { ...prev, episodes: [...prev.episodes, ...moreEps] } : prev);
    }
  };

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const visibleEp = viewableItems[0].item;
      if (visibleEp && visibleEp.seasonNumber !== selectedSeason) {
        setSelectedSeason(visibleEp.seasonNumber);
      }
    }
  }).current;
  const [sourceStatus, setSourceStatus] = useState<"loading" | "available" | "unavailable">("loading");
  const [sources, setSources] = useState<SourceItem[]>([]);

  // Download Modal State
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloadEpisode, setDownloadEpisode] = useState<any | null>(null);
  const [downloadSources, setDownloadSources] = useState<SourceItem[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);

  // Trailer Modal State
  const [trailerModalOpen, setTrailerModalOpen] = useState(false);
  const [activeTrailerKey, setActiveTrailerKey] = useState<string | null>(null);

  const handlePlayTrailer = (key: string) => {
    setActiveTrailerKey(key);
    setTrailerModalOpen(true);
  };

  // Load Media Details
  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const data = await getMediaDetail(type as 'movie' | 'tv', Number(id));
        if (mounted) {
          if (type === 'tv' && data && data.seasons && data.seasons.length > 0) {
            const firstSeason = data.seasons[0].seasonNumber === 0 && data.seasons.length > 1
              ? data.seasons[1].seasonNumber
              : data.seasons[0].seasonNumber;
            setSelectedSeason(firstSeason);
            data.episodes = await getSeasonEpisodes(Number(id), firstSeason);
          }
          setDetail(data);

          // Extract dominant color
          const imgUrl = tmdbImage(data?.backdropPath || data?.posterPath, 'w780');
          if (imgUrl) {
            ImageColors.getColors(imgUrl, { fallback: '#1a1a1a', cache: true }).then(c => {
              if (!mounted) return;
              if (c.platform === 'ios') setDominantColor(adjustDominantColor(c.primary, '#1a1a1a'));
              else if (c.platform === 'android') setDominantColor(adjustDominantColor(c.dominant || '#1a1a1a', '#1a1a1a'));
              else setDominantColor(adjustDominantColor(c.dominant || '#1a1a1a', '#1a1a1a'));
            }).catch(() => { });
          }
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

  // Load Main Source Data
  useEffect(() => {
    if (!detail) return;
    let isMounted = true;
    setSourceStatus("loading");
    setSources([]);

    fetchStreamSources(detail.mediaType, detail.id, 1, 1, false, "playback")
      .then((res: any) => {
        if (!isMounted) return;
        if (res.sources && res.sources.length > 0) {
          setSources(res.sources);
          setSourceStatus("available");
        } else {
          setSourceStatus("unavailable");
        }
      })
      .catch(() => {
        if (isMounted) {
          setSourceStatus("unavailable");
          setSources([]);
        }
      });

    return () => { isMounted = false; };
  }, [detail]);

  const fileSizeRange = useMemo(() => {
    return getFileSizeRange(sources);
  }, [sources]);

  const handleDownloadEpisode = async (ep: any) => {
    setDownloadEpisode(ep);
    setDownloadModalOpen(true);
    setLoadingSources(true);
    setDownloadSources([]);
    try {
      const res = await fetchStreamSources(
        "tv",
        detail!.id,
        ep.seasonNumber,
        ep.episodeNumber,
        false,
        "download",
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
          <BlurView intensity={20} tint="light" style={styles.closeBtn}>
            <Icon name="close-line" size={24} color="#fff" />
          </BlurView>
        </TouchableOpacity>
      </View>
    );
  }

  const isMovie = detail.mediaType === 'movie';

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO SECTION */}
        <View style={{ width, height: height * 0.80, overflow: 'hidden' }}>
          <Image
            source={{ uri: tmdbImage(detail.backdropPath || detail.posterPath, 'w1280') }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <MaskedView
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            maskElement={
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,1)', 'rgba(0,0,0,1)']}
                locations={[0.3, 0.5, 1]}
                style={StyleSheet.absoluteFill}
              />
            }
          >
            <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
          </MaskedView>
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.8)', '#000']}
            locations={[0, 0.4, 0.7, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <TouchableOpacity
            style={{ position: 'absolute', right: 16, top: insets.top + 8, zIndex: 50 }}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <BlurView intensity={20} tint="light" style={styles.closeBtn}>
              <Icon name="close-line" size={24} color="#fff" />
            </BlurView>
          </TouchableOpacity>

          <View style={styles.bannerOverlay}>
            <View style={styles.bannerContent}>
              {detail.logoPath ? (
                <Image
                  source={{ uri: tmdbImage(detail.logoPath, 'w500') }}
                  style={styles.logoImage}
                  contentFit="contain"
                />
              ) : (
                <Text style={styles.logoText}>{detail.title}</Text>
              )}

              <View style={styles.statsRow}>
                <Text style={styles.metaText}>
                  ★ {detail.voteAverage ? detail.voteAverage.toFixed(1) : "NR"} · {detail.year} · {detail.genres.slice(0, 2).join(' · ')} {detail.runtime ? `· ${runtimeLabel(detail.runtime)}` : ''}
                </Text>
                {fileSizeRange && (
                  <View style={styles.fileSizeBadge}>
                    <Text style={styles.fileSizeText}>{fileSizeRange}</Text>
                  </View>
                )}
              </View>

              <View style={styles.primaryActionRow}>
                {sourceStatus === 'loading' ? (
                  <TouchableOpacity style={[styles.watchNowButton, { opacity: 0.7 }]} disabled>
                    <ActivityIndicator size="small" color="#000" />
                    <View style={{ marginLeft: 8 }}>
                      <Text style={styles.watchNowText}>Checking...</Text>
                    </View>
                  </TouchableOpacity>
                ) : sourceStatus === 'unavailable' ? (
                  <TouchableOpacity style={[styles.watchNowButton, { backgroundColor: 'rgba(255,255,255,0.2)' }]} disabled>
                    <Icon name="error-warning-line" size={20} color="rgba(255,255,255,0.4)" />
                    <View style={{ marginLeft: 8 }}>
                      <Text style={[styles.watchNowText, { color: 'rgba(255,255,255,0.4)' }]}>Unavailable</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity 
                    style={styles.watchNowButton}
                    onPress={() => router.push(`/player/${detail.mediaType}/${detail.id}?season=${selectedSeason}&episode=1` as any)}
                  >
                    <Text style={styles.watchNowText}>Watch Now</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity activeOpacity={0.8} style={{ flex: 1 }}>
                  <BlurView intensity={20} tint="light" style={styles.watchTogetherButton}>
                    <Text style={styles.watchTogetherText}>Watch 2gether</Text>
                  </BlurView>
                </TouchableOpacity>
              </View>

              <View style={styles.secondaryActionRow}>
                <TouchableOpacity activeOpacity={0.8}>
                  <BlurView intensity={20} tint="light" style={styles.iconButton}>
                    <Icon name="add-line" size={24} color="#fff" />
                  </BlurView>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.8}>
                  <BlurView intensity={20} tint="light" style={styles.iconButton}>
                    <Icon name="thumb-up-line" size={22} color="#fff" />
                  </BlurView>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.8}>
                  <BlurView intensity={20} tint="light" style={styles.iconButton}>
                    <Icon name="share-line" size={22} color="#fff" />
                  </BlurView>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.8}>
                  <BlurView intensity={20} tint="light" style={styles.iconButton}>
                    <Icon name="download-2-line" size={22} color="#fff" />
                  </BlurView>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* ABOUT SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 20 }}
          >
            <View style={styles.aboutCard}>
              <Text style={styles.aboutTitle}>{detail.title}</Text>
              {detail.genres.length > 0 && (
                <Text style={styles.aboutGenres}>{detail.genres.join(", ").toUpperCase()}</Text>
              )}
              <Text style={styles.aboutOverview} numberOfLines={4}>
                {detail.overview}
              </Text>
            </View>

            {!isMovie && detail.seasons && detail.seasons.length > 0 && (
              <View style={styles.aboutCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Icon name="checkbox-circle-line" size={16} color="#4ade80" />
                  <Text style={[styles.aboutGenres, { marginBottom: 0, marginLeft: 6, color: '#4ade80' }]}>TV SERIES</Text>
                </View>
                <Text style={[styles.aboutOverview, { marginTop: 12 }]}>
                  {detail.title} has {detail.seasons.length} season(s) and a total of {detail.seasons.reduce((acc: number, s: any) => acc + s.episodeCount, 0)} episodes.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>

        {/* EPISODES SECTION */}
        {!isMovie && detail.episodes && detail.episodes.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}
              onPress={() => setShowSeasonPicker(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.sectionTitle}>Season {selectedSeason}</Text>
              <Icon name="arrow-up-down-line" size={20} color="#fff" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
            <FlatList
              ref={flatListRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              data={detail.episodes}
              keyExtractor={(ep: any) => `${ep.seasonNumber}-${ep.id}`}
              onEndReached={loadNextSeason}
              onEndReachedThreshold={0.5}
              viewabilityConfig={viewabilityConfig}
              onViewableItemsChanged={onViewableItemsChanged}
              renderItem={({ item: ep }: { item: any }) => (
                <EpisodeCardItem 
                  ep={ep} 
                  handleDownloadEpisode={handleDownloadEpisode} 
                  onPlay={() => router.push(`/player/${detail.mediaType}/${detail.id}?season=${selectedSeason}&episode=${ep.episodeNumber}` as any)}
                />
              )}
            />
          </View>
        )}

        {/* TRAILERS SECTION */}
        {detail.videos && detail.videos.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.sectionTitle}>Trailers</Text>
              <Icon name="arrow-right-s-line" size={24} color="#fff" style={{ marginTop: 2 }} />
            </TouchableOpacity>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {detail.videos.slice(0, 5).map((vid: any) => (
                <TrailerCardItem key={vid.id} vid={vid} onPress={() => handlePlayTrailer(vid.key)} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* RELATED SECTION */}
        {detail.recommendations && detail.recommendations.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <MediaRow
              title="Related"
              items={detail.recommendations}
              onTitlePress={() => router.push(({ pathname: `/main/home/top-10/${type}`, params: { id: String(id), title: 'Related Content' } }) as any)}
            />
          </View>
        )}
      </ScrollView>

      {/* SEASON PICKER MODAL */}
      <Modal visible={showSeasonPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowSeasonPicker(false)} activeOpacity={1}>
          <View style={styles.seasonPickerContainer}>
            <Text style={styles.seasonPickerTitle}>Seasons</Text>
            <ScrollView style={{ maxHeight: height * 0.5 }}>
              {detail.seasons?.map((s: any) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.seasonPickerItem, selectedSeason === s.seasonNumber && styles.seasonPickerItemActive]}
                  onPress={() => fetchSeasonEpisodes(s.seasonNumber)}
                >
                  <Text style={[styles.seasonPickerText, selectedSeason === s.seasonNumber && styles.seasonPickerTextActive]}>
                    Season {s.seasonNumber}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* DOWNLOAD MODAL */}
      <Modal visible={downloadModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Download Options</Text>
              <TouchableOpacity onPress={() => setDownloadModalOpen(false)}>
                <Icon name="close-line" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            {downloadEpisode && (
              <Text style={styles.modalSubtitle}>Season {downloadEpisode.seasonNumber}, Episode {downloadEpisode.episodeNumber}</Text>
            )}

            {loadingSources ? (
              <View style={styles.centerPad}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={{ color: '#aaa', marginTop: 12 }}>Fetching links...</Text>
              </View>
            ) : downloadSources.length > 0 ? (
              <ScrollView style={{ maxHeight: 300 }}>
                {downloadSources.map((s, idx) => (
                  <TouchableOpacity key={idx} style={styles.downloadItem}>
                    <View>
                      <Text style={styles.dlQuality}>{s.quality || 'Default'}</Text>
                      <Text style={styles.dlSize}>{s.size || 'Unknown size'}</Text>
                    </View>
                    <Icon name="download-2-line" size={20} color="#fff" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.centerPad}>
                <Text style={{ color: '#aaa' }}>No download links available.</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* TRAILER MODAL */}
      <Modal visible={trailerModalOpen} transparent animationType="fade" onRequestClose={() => setTrailerModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={{ position: 'absolute', top: insets.top + 16, right: 16, zIndex: 10 }}
            onPress={() => setTrailerModalOpen(false)}
          >
            <BlurView intensity={80} tint="light" style={styles.closeBtn}>
              <Icon name="close-line" size={24} color="#fff" />
            </BlurView>
          </TouchableOpacity>
          {activeTrailerKey && (
            <View style={{ width: '100%', height: 260, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' }}>
              <WebView
                source={{ uri: `https://www.youtube.com/embed/${activeTrailerKey}?autoplay=1&modestbranding=1&rel=0&playsinline=1&origin=https://www.youtube.com` }}
                style={{ flex: 1 }}
                allowsFullscreenVideo
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled={true}
                domStorageEnabled={true}
              />
            </View>
          )}
        </View>
      </Modal>

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
  centerPad: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  bannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  bannerContent: {
    alignItems: 'center',
    width: '100%',
  },
  logoImage: {
    width: width * 0.7,
    height: 100,
  },
  logoText: {
    ...typography.headline,
    fontSize: 42,
    color: '#fff',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  metaText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
  },
  fileSizeBadge: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fileSizeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  primaryActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 12,
    marginBottom: 16,
  },
  secondaryActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  watchNowButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchNowText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  watchTogetherButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  watchTogetherText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 24,
    gap: 16
  },
  aboutCard: {
    width: width - 40,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
  },
  aboutTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  aboutGenres: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  aboutOverview: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 20,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  epCard: {
    width: 280,
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    marginRight: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  epCardImg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  epCardGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '80%',
  },
  epCardContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
  },
  epCardNumber: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  epCardName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  epCardOverview: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },
  epCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  epCardRuntime: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    flex: 1,
    marginLeft: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalSubtitle: {
    color: '#888',
    fontSize: 13,
    marginBottom: 16,
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
  downloadItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  dlQuality: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  dlSize: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  }
});
