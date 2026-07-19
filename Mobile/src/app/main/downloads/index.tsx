import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import Icon from 'react-native-remix-icon';

import { colors, typography } from '@/constants/theme';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import {
  getCompletedDownloads,
  getActiveDownloadsList,
  deleteDownload,
  cancelDownload,
  subscribeToDownloads,
  DownloadItem,
  ActiveDownload,
} from '@/services/download';

const { width } = Dimensions.get('window');

interface GroupedDownload {
  id: number;
  type: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  localPosterUri: string | null;
  overview: string;
  year: string;
  voteAverage: number;
  runtime: number | null;
  episodes: DownloadItem[];
  totalSizeStr: string;
}

export default function DownloadsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isOffline } = useNetworkStatus();

  // Downloads State
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [expandedShowIds, setExpandedShowIds] = useState<number[]>([]);

  useEffect(() => {
    // Load initial downloads
    setDownloads(getCompletedDownloads());
    setActiveDownloads(getActiveDownloadsList());

    // Subscribe to download progress & state updates
    const unsubscribe = subscribeToDownloads(() => {
      setDownloads([...getCompletedDownloads()]);
      setActiveDownloads([...getActiveDownloadsList()]);
    });

    return () => unsubscribe();
  }, []);

  // Toggle Accordion
  const toggleShowExpansion = (showId: number) => {
    if (expandedShowIds.includes(showId)) {
      setExpandedShowIds(expandedShowIds.filter((id) => id !== showId));
    } else {
      setExpandedShowIds([...expandedShowIds, showId]);
    }
  };

  // Group Downloads
  const groupedDownloads = useMemo(() => {
    const groups: GroupedDownload[] = [];

    downloads.forEach((item) => {
      if (item.mediaType === 'movie') {
        groups.push({
          id: item.id,
          type: 'movie',
          title: item.title,
          posterPath: item.posterPath,
          localPosterUri: item.localPosterUri,
          overview: item.overview,
          year: item.year,
          voteAverage: item.voteAverage,
          runtime: item.runtime,
          episodes: [],
          totalSizeStr: item.sizeStr,
        });
      } else {
        // TV Episode grouping
        let group = groups.find((g) => g.type === 'tv' && g.id === item.id);
        if (!group) {
          group = {
            id: item.id,
            type: 'tv',
            title: item.title,
            posterPath: item.posterPath,
            localPosterUri: item.localPosterUri,
            overview: item.overview,
            year: item.year,
            voteAverage: item.voteAverage,
            runtime: item.runtime,
            episodes: [],
            totalSizeStr: '0 MB',
          };
          groups.push(group);
        }
        group.episodes.push(item);
      }
    });

    // Sort episodes inside groups and calculate total size
    groups.forEach((g) => {
      if (g.type === 'tv') {
        g.episodes.sort((a, b) => {
          if (a.seasonNumber !== b.seasonNumber) {
            return (a.seasonNumber || 0) - (b.seasonNumber || 0);
          }
          return (a.episodeNumber || 0) - (b.episodeNumber || 0);
        });

        const totalBytes = g.episodes.reduce((sum, ep) => sum + (ep.sizeBytes || 0), 0);
        if (totalBytes > 0) {
          g.totalSizeStr =
            totalBytes >= 1024 * 1024 * 1024
              ? (totalBytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
              : Math.round(totalBytes / (1024 * 1024)) + ' MB';
        } else {
          g.totalSizeStr = g.episodes[0]?.sizeStr || 'Unknown';
        }
      }
    });

    // Sort groups by addedAt of latest item
    return groups;
  }, [downloads]);

  // Handle playing movie
  const handlePlayMovie = (movieId: number) => {
    router.push(`/player/movie/${movieId}?season=1&episode=1`);
  };

  // Handle playing episode
  const handlePlayEpisode = (showId: number, season: number, episode: number) => {
    router.push(`/player/tv/${showId}?season=${season}&episode=${episode}`);
  };

  // Delete Movie confirmation
  const handleDeleteMovie = (movieId: number, title: string) => {
    Alert.alert(
      'Delete Download',
      `Are you sure you want to delete "${title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteDownload('movie', movieId),
        },
      ]
    );
  };

  // Delete entire Show (all episodes)
  const handleDeleteShow = (showId: number, title: string, episodes: DownloadItem[]) => {
    Alert.alert(
      'Delete Series Downloads',
      `Delete all ${episodes.length} episodes of "${title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            for (const ep of episodes) {
              await deleteDownload('tv', showId, ep.seasonNumber, ep.episodeNumber);
            }
          },
        },
      ]
    );
  };

  // Delete Single Episode from Show accordion
  const handleDeleteEpisode = (showId: number, season: number, episodeNum: number, episodeName: string) => {
    Alert.alert(
      'Delete Episode',
      `Delete "${episodeName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteDownload('tv', showId, season, episodeNum),
        },
      ]
    );
  };

  const hasContent = groupedDownloads.length > 0 || activeDownloads.length > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* HEADER ROW */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Downloads</Text>
        {hasContent && (
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => setIsEditing(!isEditing)}
            activeOpacity={0.8}
          >
            <Text style={styles.editButtonText}>{isEditing ? 'Done' : 'Edit'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* OFFLINE STATUS BANNER */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Icon name="wifi-off-line" size={16} color="#54B4D3" />
          <Text style={styles.offlineBannerText}>Offline Mode · Showing downloads only</Text>
        </View>
      )}

      {hasContent ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ACTIVE DOWNLOADS IN PROGRESS */}
          {activeDownloads.length > 0 && (
            <View style={styles.activeDownloadsSection}>
              <Text style={styles.sectionSubtitle}>Downloading</Text>
              {activeDownloads.map((active) => {
                const key = `${active.mediaType}:${active.id}:${active.seasonNumber || 0}:${active.episodeNumber || 0}`;
                return (
                  <View key={key} style={styles.activeCard}>
                    <View style={styles.activeCardInfo}>
                      <View style={styles.activeCardText}>
                        <Text style={styles.activeTitle} numberOfLines={1}>
                          {active.title}
                        </Text>
                        {active.mediaType === 'tv' && (
                          <Text style={styles.activeSubtitle} numberOfLines={1}>
                            S{active.seasonNumber}:E{active.episodeNumber} · {active.episodeName}
                          </Text>
                        )}
                        <Text style={styles.activePercent}>
                          {Math.round(active.progress * 100)}% downloaded
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.cancelBtn}
                        onPress={() =>
                          cancelDownload(
                            active.mediaType,
                            active.id,
                            active.seasonNumber,
                            active.episodeNumber
                          )
                        }
                      >
                        <Icon name="close-circle-fill" size={24} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.progressBarBg}>
                      <View
                        style={[styles.progressBarFill, { width: `${active.progress * 100}%` }]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* COMPLETED DOWNLOADS LIST */}
          {groupedDownloads.length > 0 && (
            <View style={styles.listSection}>
              {groupedDownloads.map((group) => {
                const isExpanded = expandedShowIds.includes(group.id);
                const displayImage = group.localPosterUri || group.posterPath;

                return (
                  <View key={`${group.type}:${group.id}`} style={styles.groupedItemContainer}>
                    {/* Show/Movie Header Card */}
                    <TouchableOpacity
                      style={styles.mediaCard}
                      activeOpacity={group.type === 'movie' ? 0.7 : 0.9}
                      onPress={() => {
                        if (isEditing) {
                          if (group.type === 'movie') {
                            handleDeleteMovie(group.id, group.title);
                          } else {
                            handleDeleteShow(group.id, group.title, group.episodes);
                          }
                        } else {
                          if (group.type === 'movie') {
                            handlePlayMovie(group.id);
                          } else {
                            toggleShowExpansion(group.id);
                          }
                        }
                      }}
                    >
                      {/* Media Image */}
                      <View style={styles.posterWrapper}>
                        {displayImage ? (
                          <Image
                            source={{ uri: displayImage as string }}
                            style={styles.poster}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={styles.posterFallback}>
                            <Icon name="film-line" size={28} color="rgba(255,255,255,0.2)" />
                          </View>
                        )}
                        {/* Play overlay for movies in normal mode */}
                        {group.type === 'movie' && !isEditing && (
                          <View style={styles.playOverlay}>
                            <View style={styles.playIconCircle}>
                              <Icon name="play-fill" size={16} color="#000" />
                            </View>
                          </View>
                        )}
                      </View>

                      {/* Content details */}
                      <View style={styles.mediaDetails}>
                        <Text style={styles.mediaTitle} numberOfLines={2}>
                          {group.title}
                        </Text>
                        <Text style={styles.mediaMeta}>
                          {group.type === 'movie' ? (
                            <>
                              {group.year} · {group.runtime ? runtimeLabel(group.runtime) : ''} ·{' '}
                              {group.totalSizeStr}
                            </>
                          ) : (
                            <>
                              {group.episodes.length}{' '}
                              {group.episodes.length === 1 ? 'episode' : 'episodes'} ·{' '}
                              {group.totalSizeStr}
                            </>
                          )}
                        </Text>
                      </View>

                      {/* Right Indicator (Trash or Chevron/Play) */}
                      <View style={styles.rightAction}>
                        {isEditing ? (
                          <Icon name="delete-bin-line" size={22} color={colors.danger} />
                        ) : group.type === 'movie' ? (
                          <Icon name="play-mini-line" size={22} color="rgba(255,255,255,0.6)" />
                        ) : (
                          <Icon
                            name={isExpanded ? 'arrow-up-s-line' : 'arrow-down-s-line'}
                            size={22}
                            color="rgba(255,255,255,0.6)"
                          />
                        )}
                      </View>
                    </TouchableOpacity>

                    {/* TV Episode accordion list */}
                    {group.type === 'tv' && isExpanded && (
                      <View style={styles.accordionContainer}>
                        {group.episodes.map((ep) => (
                          <TouchableOpacity
                            key={`${ep.seasonNumber}:${ep.episodeNumber}`}
                            style={styles.episodeRow}
                            activeOpacity={0.7}
                            onPress={() => {
                              if (isEditing) {
                                handleDeleteEpisode(
                                  group.id,
                                  ep.seasonNumber || 1,
                                  ep.episodeNumber || 1,
                                  ep.episodeName || 'Episode'
                                );
                              } else {
                                handlePlayEpisode(
                                  group.id,
                                  ep.seasonNumber || 1,
                                  ep.episodeNumber || 1
                                );
                              }
                            }}
                          >
                            <View style={styles.episodeThumbnailWrapper}>
                              {ep.localPosterUri || ep.posterPath ? (
                                <Image
                                  source={{ uri: (ep.localPosterUri || ep.posterPath) as string }}
                                  style={styles.episodeThumbnail}
                                  contentFit="cover"
                                />
                              ) : (
                                <View style={styles.episodeThumbnailFallback}>
                                  <Icon name="film-line" size={16} color="rgba(255,255,255,0.2)" />
                                </View>
                              )}
                              {!isEditing && (
                                <View style={styles.thumbnailPlayOverlay}>
                                  <Icon name="play-fill" size={12} color="#fff" />
                                </View>
                              )}
                            </View>

                            <View style={styles.episodeDetails}>
                              <Text style={styles.episodeTitle} numberOfLines={1}>
                                S{ep.seasonNumber}:E{ep.episodeNumber} · {ep.episodeName}
                              </Text>
                              <Text style={styles.episodeMeta}>
                                {ep.sizeStr} ·{' '}
                                {ep.runtime ? runtimeLabel(ep.runtime) : 'Unknown duration'}
                              </Text>
                            </View>

                            <View style={styles.episodeRightAction}>
                              {isEditing ? (
                                <Icon name="delete-bin-line" size={18} color={colors.danger} />
                              ) : (
                                <Icon name="play-fill" size={16} color="#fff" />
                              )}
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      ) : (
        /* EMPTY STATE VIEW */
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Icon name="download-2-line" size={56} color="#404040" />
          </View>

          <Text style={styles.emptyTitle}>Never be without Streamn</Text>
          <Text style={styles.emptySubtitle}>
            Download shows and movies so you'll never be without something to watch — even when
            you're offline.
          </Text>

          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => router.push('/main/home')}
            activeOpacity={0.8}
          >
            <Text style={styles.emptyButtonText}>See What You Can Download</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerTitle: {
    ...typography.title,
    fontSize: 24,
    color: '#fff',
    fontWeight: '700',
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1E1E1E',
  },
  editButtonText: {
    ...typography.button,
    fontSize: 14,
    color: '#fff',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(84,180,211,0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(84,180,211,0.15)',
    paddingVertical: 8,
    gap: 8,
  },
  offlineBannerText: {
    ...typography.caption,
    color: '#54B4D3',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  activeDownloadsSection: {
    marginBottom: 24,
    backgroundColor: '#0D0D0F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
  },
  sectionSubtitle: {
    ...typography.caption,
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '700',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeCard: {
    marginBottom: 16,
  },
  activeCardInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  activeCardText: {
    flex: 1,
    paddingRight: 16,
  },
  activeTitle: {
    ...typography.bodyBold,
    fontSize: 15,
    color: '#fff',
  },
  activeSubtitle: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  activePercent: {
    ...typography.caption,
    fontSize: 11,
    color: '#54B4D3',
    fontWeight: '600',
    marginTop: 2,
  },
  cancelBtn: {
    padding: 4,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#252525',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#54B4D3',
    borderRadius: 2,
  },
  listSection: {
    gap: 12,
  },
  groupedItemContainer: {
    backgroundColor: '#0A0A0B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  mediaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  posterWrapper: {
    width: 90,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#151515',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaDetails: {
    flex: 1,
    marginLeft: 16,
    paddingRight: 8,
  },
  mediaTitle: {
    ...typography.bodyBold,
    fontSize: 15,
    color: '#fff',
  },
  mediaMeta: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  rightAction: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accordionContainer: {
    backgroundColor: '#070708',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.03)',
    paddingLeft: 24,
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  episodeThumbnailWrapper: {
    width: 60,
    height: 40,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#151515',
  },
  episodeThumbnail: {
    width: '100%',
    height: '100%',
  },
  episodeThumbnailFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailPlayOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodeDetails: {
    flex: 1,
    marginLeft: 12,
    paddingRight: 8,
  },
  episodeTitle: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  episodeMeta: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 2,
  },
  episodeRightAction: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  emptyIconCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#121214',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  emptyTitle: {
    ...typography.headline,
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
  },
  emptySubtitle: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  emptyButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#E6E6E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonText: {
    ...typography.button,
    fontSize: 15,
    color: '#000000',
    fontWeight: '700',
  },
});

function runtimeLabel(minutes: number | null) {
  if (!minutes) return '';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins}m`;
  return `${hours}h ${mins}m`;
}
