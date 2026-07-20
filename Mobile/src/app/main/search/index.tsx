import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Animated,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import Icon from 'react-native-remix-icon';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, typography, fontFamilies } from '@/constants/theme';
import { getTrending, searchByTitle, searchWithPlan } from '@/services/tmdb';
import { createSearchPlan } from '@/services/gemini';
import { MediaSummary } from '@/services/media';
import LandscapeMediaCard from '@/components/LandscapeMediaCard';
import AiMatchCard from '@/components/AiMatchCard';
import MediaCard from '@/components/MediaCard';

type Message = {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  results?: MediaSummary[];
};

type TextToken = {
  text: string;
  isBold: boolean;
};

// Simple Markdown bold parser
function parseMarkdown(text: string): TextToken[] {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return { text: part.slice(2, -2), isBold: true };
    }
    return { text: part, isBold: false };
  });
}

// Letter-by-letter fade-in streaming component
function FadeInStreamingText({ text, onComplete }: { text: string; onComplete?: () => void }) {
  const [currentProgress, setCurrentProgress] = useState(0);

  useEffect(() => {
    setCurrentProgress(0);
    const totalLength = text.length;
    if (totalLength === 0) {
      if (onComplete) onComplete();
      return;
    }

    let progressVal = 0;
    const interval = setInterval(() => {
      // 1.5 characters per 16ms tick
      progressVal += 1.5;
      if (progressVal >= totalLength) {
        setCurrentProgress(totalLength);
        clearInterval(interval);
        if (onComplete) onComplete();
      } else {
        setCurrentProgress(progressVal);
      }
    }, 16);

    return () => clearInterval(interval);
  }, [text]);

  const tokens = parseMarkdown(text);
  let globalCharIndex = 0;

  return (
    <Text style={styles.messageText}>
      {tokens.map((token, tokenIdx) => {
        const chars = Array.from(token.text);
        return chars.map((char, charIdx) => {
          const idx = globalCharIndex++;
          // Fades in across a 4-character window for smooth blooming transition
          const charOpacity = Math.max(0, Math.min(1, (currentProgress - idx) / 4));
          return (
            <Text
              key={`${tokenIdx}-${charIdx}`}
              style={{
                opacity: charOpacity,
                fontWeight: token.isBold ? '700' : '400',
                color: '#E2E8F0',
                fontSize: 15,
                lineHeight: 22,
              }}
            >
              {char}
            </Text>
          );
        });
      })}
    </Text>
  );
}

// Static Markdown component for old messages
function MarkdownText({ text }: { text: string }) {
  const tokens = parseMarkdown(text);
  return (
    <Text style={styles.messageText}>
      {tokens.map((token, tokenIdx) => (
        <Text
          key={tokenIdx}
          style={{
            fontWeight: token.isBold ? '700' : '400',
            color: '#E2E8F0',
            fontSize: 15,
            lineHeight: 22,
          }}
        >
          {token.text}
        </Text>
      ))}
    </Text>
  );
}

// Animated Message Row container
function AnimatedMessageRow({ children, isUser }: { children: React.ReactNode; isUser: boolean }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(15)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.messageRow,
        isUser ? styles.userMessageRow : styles.aiMessageRow,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// Container component for AI responses (handles results lists fade-in after typing)
function AiMessageContent({ message, isLatest }: { message: Message; isLatest: boolean }) {
  const [showResults, setShowResults] = useState(!isLatest);
  const fadeAnim = useRef(new Animated.Value(isLatest ? 0 : 1)).current;
  const router = useRouter();

  useEffect(() => {
    if (showResults && isLatest) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }).start();
    }
  }, [showResults, isLatest]);

  return (
    <View style={styles.aiMessageContentContainer}>
      {isLatest ? (
        <FadeInStreamingText text={message.text} onComplete={() => setShowResults(true)} />
      ) : (
        <MarkdownText text={message.text} />
      )}

      {message.results && message.results.length > 0 && showResults && (
        <Animated.View style={{ opacity: fadeAnim, marginTop: 12 }}>
          {/* Top Matches Section */}
          <Text style={styles.aiResultsSubheading}>Top matches</Text>
          <FlatList
            data={message.results.slice(0, 4)}
            horizontal
            keyExtractor={(item) => `top-${item.id}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.aiHorizontalList}
            renderItem={({ item }) => (
              <AiMatchCard
                item={item}
                onPress={() => router.push(`/main/home/detail/${item.mediaType}/${item.id}` as any)}
              />
            )}
          />

          {/* Related Results Section */}
          {message.results.length > 4 && (
            <>
              <Text style={styles.aiResultsSubheading}>Related results</Text>
              <FlatList
                data={message.results.slice(4, 12)}
                horizontal
                keyExtractor={(item) => `related-${item.id}`}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.aiHorizontalListSmall}
                renderItem={({ item }) => (
                  <MediaCard
                    item={item}
                    onPress={() => router.push(`/main/home/detail/${item.mediaType}/${item.id}` as any)}
                  />
                )}
              />
            </>
          )}
        </Animated.View>
      )}
    </View>
  );
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();

  const { ai } = useLocalSearchParams<{ ai?: string }>();

  // Tab mode & search inputs
  const [isAiMode, setIsAiMode] = useState(ai === 'true');

  const toggleAiMode = (active: boolean) => {
    setIsAiMode(active);
    router.setParams({ ai: active ? 'true' : 'false' });
  };

  // Entrance slide-up and fade animation for floating button
  const floatingEntranceAnim = useRef(new Animated.Value(0)).current;
  const floatingTranslateY = useRef(new Animated.Value(25)).current;

  useEffect(() => {
    if (!isAiMode) {
      floatingEntranceAnim.setValue(0);
      floatingTranslateY.setValue(25);
      Animated.parallel([
        Animated.timing(floatingEntranceAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(floatingTranslateY, {
          toValue: 0,
          friction: 7,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isAiMode]);

  const [searchQuery, setSearchQuery] = useState('');
  const [aiQuery, setAiQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // Search results lists
  const [recommendedItems, setRecommendedItems] = useState<MediaSummary[]>([]);
  const [searchResults, setSearchResults] = useState<MediaSummary[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // AI Chat states
  const [chatHistory, setChatHistory] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: "Welcome to Streamn AI Search! Ask me anything—search by mood, vibe, or detailed description (e.g. 'something scary but not too scary' or 'a clever sci-fi mystery with rain-soaked city vibes').",
    },
  ]);

  const scrollViewRef = useRef<ScrollView>(null);
  const borderOpacity = useRef(new Animated.Value(1)).current;
  const borderPulse = useRef(new Animated.Value(0)).current;
  const aiViewFade = useRef(new Animated.Value(0)).current;

  // Dynamically hide the tab navigator bar when inside AI search mode
  useEffect(() => {
    const parent = navigation.getParent();

    // Hide or show tab navigator using display options on both local screen and parent tab
    if (isAiMode) {
      navigation.setOptions({
        tabBarStyle: { display: 'none' }
      });
      if (parent) {
        parent.setOptions({
          tabBarStyle: { display: 'none' }
        });
      }
      Animated.timing(aiViewFade, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }).start();
    } else {
      const defaultTabStyle = {
        position: 'absolute',
        borderTopWidth: 1,
        borderTopColor: 'rgba(38, 38, 38, 0.33)',
        elevation: 0,
        height: 90,
        backgroundColor: 'black',
        paddingTop: 8,
      };
      navigation.setOptions({
        tabBarStyle: defaultTabStyle
      });
      if (parent) {
        parent.setOptions({
          tabBarStyle: defaultTabStyle
        });
      }
      aiViewFade.setValue(0);
    }

    return () => {
      const defaultTabStyle = {
        position: 'absolute',
        borderTopWidth: 1,
        borderTopColor: 'rgba(38, 38, 38, 0.33)',
        elevation: 0,
        height: 90,
        backgroundColor: 'black',
        paddingTop: 8,
      };
      navigation.setOptions({
        tabBarStyle: defaultTabStyle
      });
      if (parent) {
        parent.setOptions({
          tabBarStyle: defaultTabStyle
        });
      }
    };
  }, [isAiMode, navigation]);

  // Pulse animation for AI input border during loading
  useEffect(() => {
    if (loading && isAiMode) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(borderOpacity, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(borderOpacity, {
            toValue: 1.0,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      borderOpacity.setValue(1.0);
    }
  }, [loading, isAiMode]);

  // Recurring border animation for AI toggle button
  useEffect(() => {
    const animate = () => {
      borderPulse.setValue(0);
      Animated.sequence([
        Animated.timing(borderPulse, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.delay(1200),
        Animated.timing(borderPulse, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start();
    };

    const initialTimeout = setTimeout(animate, 1500);
    const interval = setInterval(animate, 6000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, []);

  // Load trending items on mount
  useEffect(() => {
    let mounted = true;
    getTrending('all', 'week')
      .then((data) => {
        if (mounted) {
          setRecommendedItems(data);
        }
      })
      .catch((err) => {
        console.error('Error fetching recommended items:', err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Auto-scroll chat history
  useEffect(() => {
    if (isAiMode) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [chatHistory, isAiMode]);

  // Handle Standard Search Submit
  const handleStandardSearchSubmit = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const results = await searchByTitle(searchQuery.trim());
      setSearchResults(results);
    } catch (err) {
      console.error('Error performing standard search:', err);
    } finally {
      setLoading(false);
    }
  };

  // Clear standard search query
  const handleClearStandardQuery = () => {
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
  };

  // Handle AI Search Submit
  const handleAiSearchSubmit = async (textToSearch: string) => {
    const text = textToSearch.trim();
    if (!text || loading) return;

    // Add user message
    const userMsg: Message = {
      id: String(Date.now()),
      sender: 'user',
      text,
    };
    setChatHistory((prev) => [...prev, userMsg]);
    setAiQuery('');
    setLoading(true);

    try {
      // 1. Get query plan via Gemini
      const plan = await createSearchPlan(text);

      // 2. Fetch TMDB matches with plan
      const results = await searchWithPlan(plan);

      // 3. Add AI message
      const aiMsg: Message = {
        id: String(Date.now() + 1),
        sender: 'ai',
        text: plan.label || "Here are some recommendations based on your request:",
        results,
      };
      setChatHistory((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.error('AI search failed:', err);
      const errorMsg: Message = {
        id: String(Date.now() + 1),
        sender: 'ai',
        text: "Sorry, I ran into an issue finding suggestions. Please try again.",
      };
      setChatHistory((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const promptExamples = [
    "something scary but not too scary",
    "a clever sci-fi mystery with rain-soaked city vibes",
    "comfort comedy for a Sunday night",
    "romantic drama with rich people problems",
  ];

  // Identify latest AI response to toggle typewriter animation
  const latestAiMessageId = chatHistory.filter((m) => m.sender === 'ai').slice(-1)[0]?.id;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Subtle premium background gradient for AI Search */}
      {isAiMode && (
        <LinearGradient
          colors={['#170c32', '#020205', '#091c36']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* 1. Header Area */}
      {!isAiMode ? (
        <View style={styles.headerContainer}>
          <Text style={styles.headerTitle}>Search</Text>
          <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.7}>
            <Icon name="notification-2-line" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.headerContainer}>
          <View style={styles.aiHeaderTitleRow}>
            <Text style={styles.headerTitle}>Search</Text>
            <View style={styles.betaBadge}>
              <Text style={styles.betaBadgeText}>BETA</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => toggleAiMode(false)}
            activeOpacity={0.7}
          >
            <Icon name="close-line" size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* 2. Content Body */}
      {!isAiMode ? (
        // Standard Search View
        <View style={styles.standardContainer}>
          {/* Search bar row */}
          <View style={styles.searchBarRow}>
            <View style={styles.searchBarInputWrapper}>
              <Icon name="search-line" size={20} color="rgba(255, 255, 255, 0.4)" style={styles.searchBarIcon} />
              <TextInput
                style={styles.searchBarInput}
                placeholder="Search shows, movies, games..."
                placeholderTextColor="rgba(255, 255, 255, 0.3)"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleStandardSearchSubmit}
                returnKeyType="search"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity style={styles.searchClearButton} onPress={handleClearStandardQuery}>
                  <Icon name="close-circle-fill" size={18} color="rgba(255, 255, 255, 0.4)" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Search Content */}
          {loading ? (
            <View style={styles.centerIndicator}>
              <ActivityIndicator size="large" color="#00c6ff" />
            </View>
          ) : (
            <FlatList
              data={hasSearched ? searchResults : recommendedItems}
              keyExtractor={(item) => `${item.mediaType}-${item.id}`}
              ListHeaderComponent={
                <Text style={styles.sectionHeader}>
                  {hasSearched ? 'Search Results' : 'Recommended TV Shows & Movies'}
                </Text>
              }
              ListEmptyComponent={
                hasSearched ? (
                  <View style={styles.emptyContainer}>
                    <Icon name="film-line" size={48} color="rgba(255, 255, 255, 0.2)" />
                    <Text style={styles.emptyText}>No matches found. Try search suggestions or another title.</Text>
                  </View>
                ) : null
              }
              renderItem={({ item }) => (
                <LandscapeMediaCard
                  item={item}
                  onPress={() => router.push(`/main/home/detail/${item.mediaType}/${item.id}` as any)}
                />
              )}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}

          {/* Centered Floating AI Search button */}
          <Animated.View
            style={[
              styles.floatingAiBtnWrapper,
              {
                opacity: floatingEntranceAnim,
                transform: [{ translateY: floatingTranslateY }],
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => toggleAiMode(true)}
              style={styles.floatingAiBtn}
            >
              {/* Static background overlay */}
              <View style={StyleSheet.absoluteFill}>
                <View style={styles.aiToggleStaticBg} />
              </View>

              {/* Animating Gradient Border */}
              <Animated.View style={[StyleSheet.absoluteFill, { opacity: borderPulse }]}>
                <LinearGradient
                  colors={['#00c6ff', '#0072ff']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>

              {/* Inner button overlay */}
              <View style={styles.floatingAiBtnInner}>
                <Icon name="search-ai-line" size={16} color="#FFFFFF" />
                <Text style={styles.floatingAiBtnLabel}>AI Search</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>
      ) : (
        // AI Search View (Animated container fade-in)
        <Animated.View style={[styles.aiFlexContainer, { opacity: aiViewFade }]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            style={styles.aiFlexContainer}
          >
            {/* Chat scrolling history */}
            <ScrollView
              ref={scrollViewRef}
              style={styles.chatScrollView}
              contentContainerStyle={styles.chatScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {chatHistory.map((message) => {
                const isUser = message.sender === 'user';
                return (
                  <AnimatedMessageRow key={message.id} isUser={isUser}>
                    {isUser ? (
                      // User plain text layout (no chat bubble)
                      <View style={styles.userTextContainer}>
                        <MarkdownText text={message.text} />
                      </View>
                    ) : (
                      // AI plain text layout (no chat bubble)
                      <View style={styles.aiTextContainer}>
                        <AiMessageContent
                          message={message}
                          isLatest={message.id === latestAiMessageId}
                        />

                        {/* Preset Suggestions for Welcome msg */}
                        {message.id === 'welcome' && (
                          <View style={styles.suggestionsContainer}>
                            {promptExamples.map((example) => (
                              <TouchableOpacity
                                key={example}
                                style={styles.suggestionChip}
                                onPress={() => handleAiSearchSubmit(example)}
                              >
                                <Text style={styles.suggestionChipText}>{example}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                  </AnimatedMessageRow>
                );
              })}
            </ScrollView>

            {/* Bottom input area (Absolute positioned, transparent top gradient panel) */}
            <View style={[styles.aiBottomPanel, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              {/* Fade background gradient overlay */}
              <LinearGradient
                colors={['transparent', 'rgba(0, 0, 0, 0.85)', '#000000']}
                locations={[0, 0.3, 1]}
                style={StyleSheet.absoluteFill}
              />

              {/* Animating gradient border around input */}
              <View style={styles.gradientBorderWrapper}>
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: borderOpacity }]}>
                  <LinearGradient
                    colors={['#00ffff', '#0072ff', '#0c0e12']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
                <View style={styles.aiInputContainer}>
                  <TextInput
                    style={styles.aiInput}
                    placeholder="Say something..."
                    placeholderTextColor="rgba(255, 255, 255, 0.4)"
                    value={aiQuery}
                    onChangeText={setAiQuery}
                    onSubmitEditing={() => handleAiSearchSubmit(aiQuery)}
                    returnKeyType="send"
                    editable={!loading}
                  />
                  <TouchableOpacity
                    style={styles.aiSendButton}
                    onPress={() => handleAiSearchSubmit(aiQuery)}
                    disabled={loading || !aiQuery.trim()}
                    activeOpacity={0.7}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#00c6ff" />
                    ) : (
                      <Icon name="search-ai-line" size={22} color="#00c6ff" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.aiDisclaimerText}>
                This feature is still in Beta and may make mistakes.
              </Text>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    zIndex: 10,
  },
  headerTitle: {
    ...typography.title,
    fontSize: 24,
    color: '#fff',
    fontWeight: '700',
  },
  headerIconBtn: {
    padding: 6,
  },
  aiHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  betaBadge: {
    backgroundColor: 'rgba(0, 198, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 198, 255, 0.3)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  betaBadgeText: {
    color: '#00c6ff',
    fontSize: 10,
    fontWeight: 'bold',
  },

  // Standard Search Styling
  standardContainer: {
    flex: 1,
    paddingTop: 16,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  searchBarInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#262626',
    borderRadius: 10,
    height: 48,
    position: 'relative',
  },
  searchBarIcon: {
    marginLeft: 16,
  },
  searchBarInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: typography.body.fontFamily,
    paddingLeft: 10,
    paddingRight: 40,
    height: '100%',
  },
  searchClearButton: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  floatingAiBtnWrapper: {
    position: 'absolute',
    bottom: 120, // Float above bottom tab navigation
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  floatingAiBtn: {
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    minWidth: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiToggleStaticBg: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
  },
  floatingAiBtnInner: {
    position: 'absolute',
    top: 1.5,
    left: 1.5,
    right: 1.5,
    bottom: 1.5,
    backgroundColor: '#262626',
    borderRadius: 18.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  floatingAiBtnLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fontFamilies.bodyMedium,
    marginLeft: 6,
  },
  sectionHeader: {
    fontFamily: typography.title.fontFamily,
    fontWeight: '700',
    fontSize: 18,
    color: '#FFFFFF',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 100, // Account for bottom navigation tab height
  },
  centerIndicator: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },

  // AI Search Styling
  aiFlexContainer: {
    flex: 1,
  },
  chatScrollView: {
    flex: 1,
  },
  chatScrollContent: {
    paddingTop: 16,
    paddingBottom: 16,
  },
  messageRow: {
    marginVertical: 12,
    width: '100%',
    paddingHorizontal: 16,
  },
  userMessageRow: {
    alignItems: 'flex-end',
  },
  aiMessageRow: {
    alignItems: 'flex-start',
  },
  userTextContainer: {
    maxWidth: '85%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  aiTextContainer: {
    width: '100%',
    backgroundColor: 'transparent',
  },
  aiMessageContentContainer: {
    width: '100%',
  },
  messageText: {
    color: '#E2E8F0',
    fontSize: 15,
    lineHeight: 22,
    fontFamily: typography.body.fontFamily,
  },
  suggestionsContainer: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  suggestionChipText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 13,
    fontFamily: typography.caption.fontFamily,
  },

  // Horizontal AI matches
  aiResultsContainer: {
    marginTop: 14,
    width: '100%',
  },
  aiResultsSubheading: {
    fontFamily: typography.bodyBold.fontFamily,
    fontWeight: '700',
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: 14,
    marginBottom: 10,
    paddingLeft: 4,
  },
  aiHorizontalList: {
    paddingRight: 16,
    paddingBottom: 8,
  },
  aiHorizontalListSmall: {
    paddingRight: 16,
    paddingBottom: 8,
    gap: 12,
  },

  // Bottom Input panel (rests in normal flow at the bottom)
  aiBottomPanel: {
    paddingHorizontal: 16,
    paddingTop: 24,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  gradientBorderWrapper: {
    borderRadius: 28,
    padding: 1.5, // thickness of gradient border
    height: 56,
    overflow: 'hidden',
  },
  aiInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0c0e12',
    borderRadius: 26.5, // fit inside border
    paddingHorizontal: 16,
  },
  aiInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: typography.body.fontFamily,
    height: '100%',
  },
  aiSendButton: {
    padding: 6,
  },
  aiDisclaimerText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    fontFamily: typography.caption.fontFamily,
    zIndex: 11,
  },
});
