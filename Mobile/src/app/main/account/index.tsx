import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  TextInput,
  Alert,
  Dimensions,
  RefreshControl,
  Share,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '@/components/providers/auth-provider';
import { colors, typography, fontFamilies } from '@/constants/theme';
import Icon from 'react-native-remix-icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DefaultAvatarFace } from '@/components/ui/default-avatar';
import { Sheet } from '@/components/ui/sheet';
import { tmdbImage } from '@/services/media';
import {
  getWatchHistory,
  removeFromWatchHistory,
  getLikedMedia,
  unlikeMedia,
  getMyWatchlists,
  getWatchlistItems,
  createWatchlist,
  deleteWatchlist,
  updateWatchlist,
  createWatchlistInvite,
  getUserProfile,
} from '@/services/supabase';

const { width } = Dimensions.get('window');
const CARD_WIDTH = 120;
const CARD_ASPECT_RATIO = 1.4;

function formatProgress(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, showGoogleSignIn, handleGuestSignIn, loading: authLoading } = useAuth();

  const [profile, setProfile] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [liked, setLiked] = useState<any[]>([]);
  const [watchlists, setWatchlists] = useState<any[]>([]);
  const [watchlistItemsMap, setWatchlistItemsMap] = useState<Record<string, any[]>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Create Watchlist Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createListName, setCreateListName] = useState('');
  const [createListPrivacy, setCreateListPrivacy] = useState<'public' | 'private'>('private');
  const [creatingList, setCreatingList] = useState(false);

  // Watchlist Actions Sheet state
  const [selectedListForActions, setSelectedListForActions] = useState<any | null>(null);
  const [showActionsSheet, setShowActionsSheet] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) {
      setDataLoading(false);
      return;
    }

    try {
      const [profileData, historyRows, likedRows, watchlistRows] = await Promise.all([
        getUserProfile(),
        getWatchHistory(),
        getLikedMedia(),
        getMyWatchlists(),
      ]);

      setProfile(profileData);
      setHistory(historyRows);
      setLiked(likedRows);
      setWatchlists(watchlistRows);

      // Fetch items for each watchlist
      const itemsMap: Record<string, any[]> = {};
      await Promise.all(
        watchlistRows.map(async (list) => {
          const items = await getWatchlistItems(list.id);
          itemsMap[list.id] = items;
        })
      );
      setWatchlistItemsMap(itemsMap);
    } catch (error) {
      console.error('Error loading account data:', error);
    } finally {
      setDataLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleRemoveHistory = async (mediaId: number, mediaType: string) => {
    const ok = await removeFromWatchHistory(mediaId, mediaType);
    if (ok) {
      setHistory((prev) => prev.filter((item) => !(item.media_id === mediaId && item.media_type === mediaType)));
    }
  };

  const handleRemoveLiked = async (mediaId: number, mediaType: string) => {
    const ok = await unlikeMedia(mediaId, mediaType as any);
    if (ok) {
      setLiked((prev) => prev.filter((item) => !(item.media_id === mediaId && item.media_type === mediaType)));
    }
  };

  const handleCreateWatchlist = async () => {
    if (!createListName.trim()) return;
    setCreatingList(true);
    try {
      const newList = await createWatchlist(createListName.trim(), createListPrivacy);
      if (newList) {
        setCreateListName('');
        setCreateListPrivacy('private');
        setShowCreateModal(false);
        loadData();
      } else {
        Alert.alert('Error', 'Failed to create watchlist.');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'An error occurred.');
    } finally {
      setCreatingList(false);
    }
  };

  const handleShareWatchlist = async (list: any) => {
    setShowActionsSheet(false);
    try {
      const inviteId = await createWatchlistInvite(list.id);
      if (inviteId) {
        const webUrl = `${process.env.EXPO_PUBLIC_API_URL || 'https://streamn.vercel.app'}/invite/${inviteId}`;
        await Share.share({
          message: `Join my watchlist "${list.name}" on Streamn! ${webUrl}`,
          url: webUrl,
        });
      } else {
        Alert.alert('Error', 'Failed to create invite link.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleTogglePrivacy = async (list: any) => {
    setShowActionsSheet(false);
    const newPrivacy = list.privacy === 'public' ? 'private' : 'public';
    const ok = await updateWatchlist(list.id, { privacy: newPrivacy });
    if (ok) {
      loadData();
    } else {
      Alert.alert('Error', 'Failed to update privacy.');
    }
  };

  const handleDeleteList = async (list: any) => {
    setShowActionsSheet(false);
    Alert.alert('Delete Watchlist', `Are you sure you want to delete "${list.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const ok = await deleteWatchlist(list.id);
          if (ok) {
            loadData();
          } else {
            Alert.alert('Error', 'Failed to delete watchlist.');
          }
        },
      },
    ]);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  // Unauthorized state
  if (!user) {
    return (
      <View style={styles.unauthContainer}>
        <View style={styles.unauthContent}>
          <View style={styles.unauthIconContainer}>
            <Icon name="user-line" size={48} color="#fff" />
          </View>
          <Text style={styles.unauthTitle}>Sign in to Streamn</Text>
          <Text style={styles.unauthText}>
            Access your library, sync watch history, and create custom watchlists across all your devices.
          </Text>

          <TouchableOpacity
            style={styles.googleBtn}
            onPress={() => showGoogleSignIn()}
            activeOpacity={0.8}
          >
            <Text style={styles.googleBtnText}>Sign In with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.guestBtn}
            onPress={handleGuestSignIn}
            activeOpacity={0.8}
          >
            <Text style={styles.guestBtnText}>Continue as Guest</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const renderMediaCard = (item: any, onRemove: () => void, progressText?: string) => {
    const poster = item.poster_path || item.posterPath;
    const mediaType = item.media_type || item.mediaType;
    const mediaId = item.media_id || item.id;
    const title = item.title;

    return (
      <View style={styles.mediaCard}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push(`/main/home/detail/${mediaType}/${mediaId}`)}
          style={styles.cardImageContainer}
        >
          {poster ? (
            <Image
              source={{ uri: tmdbImage(poster, 'w300') }}
              style={styles.cardImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.cardImageEmpty}>
              <Icon name="film-line" size={24} color="rgba(255,255,255,0.2)" />
              <Text style={styles.cardEmptyText} numberOfLines={2}>
                {title}
              </Text>
            </View>
          )}

          {/* Remove Button Overlay */}
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={onRemove}
            activeOpacity={0.7}
          >
            <Icon name="close-line" size={14} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>

        <Text style={styles.cardTitle} numberOfLines={1}>
          {title}
        </Text>
        {progressText ? (
          <Text style={styles.cardSubtitle}>{progressText}</Text>
        ) : (
          <Text style={styles.cardSubtitle}>
            {item.vote_average ? `${item.vote_average.toFixed(1)} ★` : 'N/A'}
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Fixed Header Block */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 12, 50) }]}>
        <TouchableOpacity
          style={styles.headerLeft}
          onPress={() => router.push('/main/account/settings' as any)}
          activeOpacity={0.8}
        >
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <DefaultAvatarFace size={34} />
            </View>
          )}
          <Text style={styles.displayName} numberOfLines={1}>
            {profile?.display_name || user.email?.split('@')[0] || 'User'}
          </Text>
          <Icon name="arrow-down-s-fill" size={18} color="#fff" style={{ marginLeft: 4 }} />
        </TouchableOpacity>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => setShowCreateModal(true)}
            activeOpacity={0.8}
          >
            <Icon name="add-line" size={16} color="#000" />
            <Text style={styles.createBtnText}>Watchlist</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => router.push('/main/account/settings' as any)}
            activeOpacity={0.8}
          >
            <Icon name="settings-3-line" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
        }
      >

        {dataLoading ? (
          <View style={styles.innerLoading}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        ) : (
          <View style={styles.contentSections}>
            {/* Watch History */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Watch History</Text>
              {history.length > 0 ? (
                <FlatList
                  data={history}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(item) => `hist-${item.id}`}
                  renderItem={({ item }) =>
                    renderMediaCard(
                      item,
                      () => handleRemoveHistory(item.media_id, item.media_type),
                      formatProgress(item.progress_seconds)
                    )
                  }
                  contentContainerStyle={styles.listPadding}
                />
              ) : (
                <Text style={styles.emptyText}>No watch history yet.</Text>
              )}
            </View>

            {/* Liked Titles */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Liked Titles</Text>
              {liked.length > 0 ? (
                <FlatList
                  data={liked}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(item) => `liked-${item.id}`}
                  renderItem={({ item }) =>
                    renderMediaCard(item, () => handleRemoveLiked(item.media_id, item.media_type))
                  }
                  contentContainerStyle={styles.listPadding}
                />
              ) : (
                <Text style={styles.emptyText}>Nothing liked yet.</Text>
              )}
            </View>

            {/* User Watchlists */}
            <View style={[styles.section, { marginBottom: 40 }]}>
              <Text style={styles.sectionTitle}>My Watchlists</Text>
              {watchlists.length > 0 ? (
                watchlists.map((list) => {
                  const listItems = watchlistItemsMap[list.id] ?? [];
                  return (
                    <View key={list.id} style={styles.watchlistRow}>
                      <View style={styles.watchlistRowHeader}>
                        <View>
                          <Text style={styles.watchlistName}>{list.name}</Text>
                          <Text style={styles.watchlistSubtitle}>
                            {listItems.length} item{listItems.length === 1 ? '' : 's'} ·{' '}
                            {list.privacy === 'public' ? 'Public' : 'Private'}
                          </Text>
                        </View>

                        <View style={styles.rowActions}>
                          <TouchableOpacity
                            style={styles.viewAllBtn}
                            onPress={() => router.push(`/main/home/watchlist/${list.id}` as any)}
                          >
                            <Text style={styles.viewAllText}>View All</Text>
                            <Icon name="arrow-right-s-line" size={16} color="#aaa" />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {listItems.length > 0 ? (
                        <FlatList
                          data={listItems}
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          keyExtractor={(item) => `witem-${item.id}`}
                          renderItem={({ item }) =>
                            renderMediaCard(item, async () => {
                              // We can remove items from watchlist
                              const ok = await unlikeMedia(item.media_id, item.media_type); // Actually, let's call the correct remove function
                              // Wait, we need to call removeFromWatchlist
                              // We will update this immediately in the next step or define it locally
                              const { removeFromWatchlist: rmWL } = require('@/services/supabase');
                              const success = await rmWL(list.id, item.media_id, item.media_type);
                              if (success) {
                                loadData();
                              }
                            })
                          }
                          contentContainerStyle={styles.listPadding}
                        />
                      ) : (
                        <Text style={styles.emptyListText}>This watchlist is empty.</Text>
                      )}
                    </View>
                  );
                })
              ) : (
                <View style={styles.emptyWatchlistsContainer}>
                  <Icon name="bookmark-line" size={32} color="rgba(255,255,255,0.2)" />
                  <Text style={styles.emptyWatchlistsTitle}>No Watchlists Yet</Text>
                  <Text style={styles.emptyWatchlistsSubtitle}>
                    Create custom watchlists to organize your favorite movies and shows.
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyCreateBtn}
                    onPress={() => setShowCreateModal(true)}
                  >
                    <Text style={styles.emptyCreateBtnText}>Create Watchlist</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* CREATE WATCHLIST SHEET */}
      <Sheet visible={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <Text style={styles.sheetTitle}>Create Watchlist</Text>
        <TextInput
          style={styles.sheetInput}
          placeholder="Watchlist Name..."
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={createListName}
          onChangeText={setCreateListName}
          maxLength={30}
        />

        <Text style={styles.sheetSectionLabel}>Privacy</Text>
        <View style={styles.privacyRow}>
          <TouchableOpacity
            style={[styles.privacyBtn, createListPrivacy === 'private' && styles.privacyBtnActive]}
            onPress={() => setCreateListPrivacy('private')}
          >
            <Icon
              name="lock-fill"
              size={16}
              color={createListPrivacy === 'private' ? '#000' : 'rgba(255,255,255,0.6)'}
            />
            <Text
              style={[
                styles.privacyBtnText,
                createListPrivacy === 'private' && styles.privacyBtnTextActive,
              ]}
            >
              Private
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.privacyBtn, createListPrivacy === 'public' && styles.privacyBtnActive]}
            onPress={() => setCreateListPrivacy('public')}
          >
            <Icon
              name="global-line"
              size={16}
              color={createListPrivacy === 'public' ? '#000' : 'rgba(255,255,255,0.6)'}
            />
            <Text
              style={[
                styles.privacyBtnText,
                createListPrivacy === 'public' && styles.privacyBtnTextActive,
              ]}
            >
              Public
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.sheetActionBtn}
          onPress={handleCreateWatchlist}
          disabled={creatingList || !createListName.trim()}
          activeOpacity={0.8}
        >
          {creatingList ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.sheetActionBtnText}>Create Watchlist</Text>
          )}
        </TouchableOpacity>
      </Sheet>

      {/* WATCHLIST ACTIONS SHEET */}
      <Sheet visible={showActionsSheet} onClose={() => setShowActionsSheet(false)}>
        <Text style={styles.sheetTitle}>{selectedListForActions?.name}</Text>

        <TouchableOpacity
          style={styles.sheetListItem}
          onPress={() => handleShareWatchlist(selectedListForActions)}
          activeOpacity={0.7}
        >
          <Icon name="share-box-line" size={20} color="#fff" />
          <Text style={styles.sheetListItemText}>Share Watchlist</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sheetListItem}
          onPress={() => handleTogglePrivacy(selectedListForActions)}
          activeOpacity={0.7}
        >
          <Icon
            name={selectedListForActions?.privacy === 'public' ? 'lock-line' : 'global-line'}
            size={20}
            color="#fff"
          />
          <Text style={styles.sheetListItemText}>
            Make {selectedListForActions?.privacy === 'public' ? 'Private' : 'Public'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.sheetListItem, { borderBottomWidth: 0 }]}
          onPress={() => handleDeleteList(selectedListForActions)}
          activeOpacity={0.7}
        >
          <Icon name="delete-bin-line" size={20} color={colors.danger} />
          <Text style={[styles.sheetListItemText, { color: colors.danger }]}>
            Delete Watchlist
          </Text>
        </TouchableOpacity>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContent: {
    paddingBottom: 100,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unauthContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  unauthContent: {
    alignItems: 'center',
  },
  unauthIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  unauthTitle: {
    ...typography.headline,
    color: '#fff',
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 12,
  },
  unauthText: {
    ...typography.body,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  googleBtn: {
    backgroundColor: '#fff',
    width: '100%',
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  googleBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  guestBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    width: '100%',
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guestBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#000',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    paddingRight: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#333',
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#333',
  },
  displayName: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginLeft: 10,
    flexShrink: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    gap: 4,
  },
  createBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  innerLoading: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  contentSections: {
    marginTop: 10,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    ...typography.title,
    fontSize: 18,
    color: '#fff',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  listPadding: {
    paddingHorizontal: 12,
  },
  mediaCard: {
    width: CARD_WIDTH,
    marginHorizontal: 4,
  },
  cardImageContainer: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * CARD_ASPECT_RATIO,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImageEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  cardEmptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
  },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  cardTitle: {
    ...typography.bodyBold,
    fontSize: 13,
    color: '#fff',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  cardSubtitle: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginTop: 2,
    paddingHorizontal: 2,
  },
  emptyText: {
    ...typography.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 16,
    fontStyle: 'italic',
  },
  watchlistRow: {
    marginBottom: 24,
  },
  watchlistRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  watchlistName: {
    ...typography.bodyBold,
    fontSize: 16,
    color: '#fff',
  },
  watchlistSubtitle: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 2,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  moreBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    ...typography.caption,
    color: '#aaa',
    fontSize: 13,
  },
  emptyListText: {
    ...typography.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 16,
    fontStyle: 'italic',
  },
  emptyWatchlistsContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginHorizontal: 16,
    padding: 24,
  },
  emptyWatchlistsTitle: {
    ...typography.bodyBold,
    fontSize: 16,
    color: '#fff',
    marginTop: 10,
  },
  emptyWatchlistsSubtitle: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  emptyCreateBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
  },
  emptyCreateBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
  sheetTitle: {
    ...typography.title,
    fontSize: 20,
    color: '#fff',
    marginBottom: 14,
  },
  sheetInput: {
    backgroundColor: '#252525',
    color: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 18,
  },
  sheetSectionLabel: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 8,
  },
  privacyRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  privacyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  privacyBtnActive: {
    backgroundColor: '#fff',
  },
  privacyBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600',
  },
  privacyBtnTextActive: {
    color: '#000',
  },
  sheetActionBtn: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sheetActionBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
  sheetListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 14,
  },
  sheetListItemText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
});
