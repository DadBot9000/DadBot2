// app/(tabs)/index.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  Share,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAudio } from "../_layout";

const { width, height } = Dimensions.get("window");

const SFX = {
  mid: require("../../assets/sound/mid.mp3"),
  fire: require("../../assets/sound/fire.mp3"),
  next: require("../../assets/sound/next.mp3"),
  shake: require("../../assets/sound/shake.mp3"),
};

const FAVORITES_KEY = "favoriteJokes_v1";

const Particle = ({ emoji, onComplete }: any) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start(onComplete);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, (Math.random() - 0.5) * 450],
  });
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, (Math.random() - 1) * 700],
  });
  const opacity = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1, 0],
  });
  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 3],
  });

  return (
    <Animated.Text
      style={[
        styles.particle,
        { opacity, transform: [{ translateX }, { translateY }, { scale }] },
      ]}
    >
      {emoji}
    </Animated.Text>
  );
};

async function configureAudioModeForSfx() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

export default function Index() {
  const router = useRouter();
  const { bgmOn, setBgmOn, muted, setMuted, sfxVolume } = useAudio();

  const [joke, setJoke] = useState("VIBE CHECK...");
  const [isRealJoke, setIsRealJoke] = useState(false); // ✅ track if current card text is a real joke
  const [loading, setLoading] = useState(false);
  const [streak, setStreak] = useState(0);
  const [groans, setGroans] = useState(0);
  const [particles, setParticles] = useState<{ id: number; emoji: string }[]>(
    []
  );
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // ✅ Keyword bar state
  const [keyword, setKeyword] = useState("");

  // ✅ Favorites
  const [favorites, setFavorites] = useState<string[]>([]);
  const isFavorited = isRealJoke && favorites.includes(joke);

  // SFX only
  const sfxRef = useRef<Record<string, Audio.Sound>>({});

  // Load favorites once
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(FAVORITES_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setFavorites(parsed.filter((x) => typeof x === "string"));
        }
      } catch {}
    })();
  }, []);

  // Persist favorites
  useEffect(() => {
    AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)).catch(
      () => {}
    );
  }, [favorites]);

  const toggleFavorite = async () => {
    if (!isRealJoke || loading) return;

    setFavorites((prev) => {
      if (prev.includes(joke)) return prev.filter((j) => j !== joke);
      const next = [joke, ...prev.filter((j) => j !== joke)];
      return next.slice(0, 200);
    });
  };

  // Load SFX
  useEffect(() => {
    const loadSfx = async () => {
      try {
        await configureAudioModeForSfx();
        for (const [key, file] of Object.entries(SFX)) {
          const { sound } = await Audio.Sound.createAsync(file as any, {
            volume: 1.0,
          });
          sfxRef.current[key] = sound;
        }
      } catch (e) {
        console.log("SFX load error:", e);
      }
    };

    loadSfx();

    return () => {
      Object.values(sfxRef.current).forEach((s) => s.unloadAsync());
      sfxRef.current = {};
    };
  }, []);

  // Apply SFX volume/mute
  useEffect(() => {
    const v = muted ? 0 : sfxVolume;
    Object.values(sfxRef.current).forEach((s) =>
      s.setVolumeAsync(v).catch(() => {})
    );
  }, [sfxVolume, muted]);

  const playSfx = async (key: keyof typeof SFX) => {
    try {
      if (muted) return;
      const s = sfxRef.current[key as string];
      if (s) {
        await s.setVolumeAsync(sfxVolume);
        await s.replayAsync();
      }
    } catch (e) {
      console.log("SFX playback error:", e);
    }
  };

  const triggerShake = () => {
    playSfx("shake");
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 15,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -15,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const fetchJoke = async () => {
    playSfx("next");
    setLoading(true);
    try {
      const response = await fetch("https://icanhazdadjoke.com/", {
        headers: { Accept: "application/json" },
      });
      const data = await response.json();
      setJoke(data.joke);
      setIsRealJoke(true);
    } catch {
      setJoke("Check your signal, fam.");
      setIsRealJoke(false);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Keyword-based joke fetch (icanhazdadjoke search)
  const fetchJokeByKeyword = async (term: string) => {
    playSfx("next");
    setLoading(true);

    try {
      const q = encodeURIComponent(term);
      const response = await fetch(
        `https://icanhazdadjoke.com/search?term=${q}&limit=30`,
        { headers: { Accept: "application/json" } }
      );
      const data = await response.json();

      const results: Array<{ joke: string }> = Array.isArray(data?.results)
        ? data.results
        : [];

      if (results.length === 0) {
        setJoke(`No dad jokes for “${term}” yet 😅 Try another word!`);
        setIsRealJoke(false);
        return;
      }

      const pick = results[Math.floor(Math.random() * results.length)];
      if (pick?.joke) {
        setJoke(pick.joke);
        setIsRealJoke(true);
      } else {
        setJoke("DadBot dropped the punchline. Try again 😵‍💫");
        setIsRealJoke(false);
      }
    } catch {
      setJoke("DadBot tripped over a punchline 🤕 Try again!");
      setIsRealJoke(false);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = (type: "mid" | "fire") => {
    playSfx(type);

    if (type === "mid") {
      const newGroanCount = groans + 1;
      setGroans(newGroanCount);
      setStreak(0);

      const newParts = Array.from({ length: 12 }).map((_, i) => ({
        id: Math.random() + i,
        emoji: "💀",
      }));
      setParticles((p) => [...p, ...newParts]);

      if (newGroanCount >= 10) {
        triggerShake();
        setGroans(0);
      }
    } else {
      setStreak((prev) => prev + 1);
      const newParts = Array.from({ length: 12 }).map((_, i) => ({
        id: Math.random() + i,
        emoji: "😂",
      }));
      setParticles((p) => [...p, ...newParts]);
    }
  };

  // ✅ Only allow simple single-word input (letters only, length >= 2)
  const isSimpleWord = (s: string) => /^[A-Za-z]{2,}$/.test(s);

  // ✅ Real-word check (dictionary)
  const isRealEnglishWord = async (word: string) => {
    try {
      const res = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(
          word
        )}`
      );
      return res.ok;
    } catch {
      // If network fails, treat as invalid (and show message)
      return false;
    }
  };

  // ✅ Confirm keyword:
  // - dismiss keyboard
  // - clear the bar instantly
  // - show friendly messages for empty/invalid/not-real
  // - real word => fetch keyword joke
  const confirmKeyword = async () => {
    if (loading) return;

    const term = keyword.trim();

    Keyboard.dismiss();
    setKeyword(""); // ✅ clears immediately after confirm

    if (!term) {
      setJoke("...type a word, 😄 DadBot can’t read minds yet.");
      setIsRealJoke(false);
      return;
    }

    if (!isSimpleWord(term)) {
      setJoke("...one real word only 🙃 ie. “pizza”.");
      setIsRealJoke(false);
      return;
    }

    const real = await isRealEnglishWord(term.toLowerCase());
    if (!real) {
      setJoke(`“${term}” I'am missing something 🤔 Try another word!`);
      setIsRealJoke(false);
      return;
    }

    fetchJokeByKeyword(term);
  };

  const favoriteDisabled = loading || !isRealJoke;
  const shareDisabled = loading || !isRealJoke;

  // ✅ MID/FIRE blocked when not a real joke (but still tappable to show message)
  const reactionBlocked = loading || !isRealJoke;
  const blockedReactionMessage =
    "No reacting to system messages, gremlin 😈 Get a real joke first.";

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View
        style={[
          styles.blob,
          { top: -50, left: -50, backgroundColor: "#ff007a" },
        ]}
      />
      <View
        style={[
          styles.blob,
          { bottom: -50, right: -50, backgroundColor: "#00f0ff" },
        ]}
      />

      <View style={styles.particleContainer}>
        {particles.map((p) => (
          <Particle
            key={p.id}
            emoji={p.emoji}
            onComplete={() =>
              setParticles((prev) => prev.filter((x) => x.id !== p.id))
            }
          />
        ))}
      </View>

      <View style={styles.navBar}>
        {/* Left */}
        <View>
          <Text style={styles.tinyLabel}>GROAN-O-METER</Text>
          <View style={styles.groanBar}>
            <View
              style={[
                styles.groanFill,
                { width: `${Math.min(groans * 10, 100)}%` },
              ]}
            />
          </View>

          <View style={styles.audioRow}>
            <Text style={styles.bgmLabel}>BGM</Text>
            <Switch
              value={bgmOn}
              onValueChange={setBgmOn}
              thumbColor={
                Platform.OS === "android"
                  ? bgmOn
                    ? "#bcff00"
                    : "#888"
                  : undefined
              }
              trackColor={{
                false: "rgba(255,255,255,0.2)",
                true: "rgba(188,255,0,0.35)",
              }}
            />

            <TouchableOpacity
              style={[styles.muteBtn, muted && styles.muteBtnActive]}
              onPress={() => setMuted(!muted)}
              activeOpacity={0.85}
            >
              <Text style={styles.muteIcon}>{muted ? "🔇" : "🔊"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Right: MSC + SHARE inline */}
        <View style={styles.rightControls}>
          <TouchableOpacity
            style={styles.smallBtn}
            onPress={() => router.push("/modal")}
            activeOpacity={0.8}
          >
            <Text style={styles.smallBtnText}>MSC</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.smallBtn, shareDisabled && { opacity: 0.45 }]}
            onPress={() => {
              if (shareDisabled) {
                setJoke("That’s not a joke yet 😅 Try a real word first.");
                setIsRealJoke(false);
                return;
              }
              Share.share({ message: joke });
            }}
            activeOpacity={0.8}
            disabled={shareDisabled}
          >
            <Text style={styles.smallBtnText}>SHARE</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Animated.View
        style={[styles.cardContainer, { transform: [{ translateX: shakeAnim }] }]}
      >
        {/* ✅ Search bar (moves with layout) */}
        <View style={styles.searchContainer}>
          <View style={styles.searchInner}>
            <TextInput
              value={keyword}
              onChangeText={setKeyword}
              placeholder="...make a pun-ishment"
              placeholderTextColor="rgba(255, 255, 255, 0.18)"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={confirmKeyword}
              style={styles.searchInput}
            />

            <Pressable
              onPress={confirmKeyword}
              disabled={loading}
              style={({ pressed }) => [
                styles.searchButton,
                pressed && !loading && styles.searchButtonPressed,
                loading && { opacity: 0.4 },
              ]}
              hitSlop={10}
            >
              <Text style={styles.searchButtonArrow}>➜</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.miniStreakContainer}>
          <Text style={styles.miniStreakText}>🔥 {streak} STREAK</Text>
        </View>

        <View style={styles.card}>
          {loading ? (
            <ActivityIndicator size="large" color="#00f0ff" />
          ) : (
            <Text style={styles.jokeTxt}>{joke}</Text>
          )}

          {/* ❤️✨ Favorites icon (NO CIRCLE) */}
          <TouchableOpacity
            style={[styles.favBtn, favoriteDisabled && { opacity: 0.35 }]}
            onPress={toggleFavorite}
            activeOpacity={0.85}
            disabled={favoriteDisabled}
          >
            <Text style={[styles.favIcon, isFavorited && styles.favIconActive]}>
              {isFavorited ? "💖✨" : "🤍✨"}
            </Text>
          </TouchableOpacity>

          {/* Favorites count badge (tap to open /favorites) */}
          {favorites.length > 0 && (
            <TouchableOpacity
              style={styles.favCount}
              onPress={() => router.push("/favorites")}
              activeOpacity={0.8}
            >
              <Text style={styles.favCountText}>{favorites.length}</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      <View style={styles.bottomControls}>
        <View style={styles.btnBox}>
          <TouchableOpacity
            style={[styles.iconBtn, reactionBlocked && { opacity: 0.35 }]}
            onPress={() => {
              if (reactionBlocked) {
                setJoke(blockedReactionMessage);
                setIsRealJoke(false);
                return;
              }
              handleAction("mid");
            }}
            activeOpacity={0.8}
            disabled={loading} // only block taps during loading
          >
            <Text style={{ fontSize: 35 }}>💀</Text>
          </TouchableOpacity>
          <Text style={styles.btnLabel}>MID</Text>
        </View>

        <TouchableOpacity onPress={fetchJoke} activeOpacity={0.7}>
          <LinearGradient colors={["#bcff00", "#00f0ff"]} style={styles.mainNext}>
            <Text style={styles.nextText}>NEXT VIBE</Text>
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.btnBox}>
          <TouchableOpacity
            style={[styles.iconBtn, reactionBlocked && { opacity: 0.35 }]}
            onPress={() => {
              if (reactionBlocked) {
                setJoke(blockedReactionMessage);
                setIsRealJoke(false);
                return;
              }
              handleAction("fire");
            }}
            activeOpacity={0.8}
            disabled={loading} // only block taps during loading
          >
            <Text style={{ fontSize: 35 }}>🦄</Text>
          </TouchableOpacity>
          <Text style={styles.btnLabel}>FIRE</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    padding: 20,
    justifyContent: "space-between",
  },
  blob: {
    position: "absolute",
    width: 250,
    height: 250,
    borderRadius: 125,
    opacity: 0.15,
  },
  particleContainer: {
    position: "absolute",
    left: width / 2,
    top: height / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  particle: { position: "absolute", fontSize: 35 },

  navBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 50,
  },
  tinyLabel: {
    color: "#bcff00",
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 5,
  },
  groanBar: {
    width: 120,
    height: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    overflow: "hidden",
  },
  groanFill: { height: "100%", backgroundColor: "#bcff00" },

  audioRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bgmLabel: {
    color: "rgba(255,255,255,0.8)",
    fontWeight: "800",
    fontSize: 12,
  },

  muteBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  muteBtnActive: {
    backgroundColor: "rgba(255,0,0,0.18)",
    borderColor: "rgba(255,0,0,0.7)",
  },
  muteIcon: { fontSize: 16 },

  rightControls: { flexDirection: "row", alignItems: "center", gap: 10 },
  smallBtn: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  smallBtnText: { color: "white", fontWeight: "bold" },

  cardContainer: { alignItems: "center", flex: 1, justifyContent: "center" },

  // ✅ Search bar styles
  searchContainer: { width: width * 0.85, marginBottom: 12 },
  searchInner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    overflow: "hidden",
  },
  searchInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: 14,
    fontSize: 16,
    color: "white",
  },
  searchButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.12)",
  },
  searchButtonPressed: { backgroundColor: "rgba(255,255,255,0.06)" },
  searchButtonArrow: { color: "white", fontSize: 18, fontWeight: "900" },

  miniStreakContainer: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingVertical: 6,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginBottom: 15,
  },
  miniStreakText: { color: "white", fontWeight: "800" },

  card: {
    width: width * 0.85,
    padding: 35,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 40,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    position: "relative",
  },
  jokeTxt: {
    color: "white",
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },

  favBtn: {
    position: "absolute",
    right: 14,
    bottom: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  favIcon: { fontSize: 18, opacity: 0.9 },
  favIconActive: { opacity: 1 },

  favCount: {
    position: "absolute",
    left: 16,
    bottom: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  favCountText: { color: "white", fontWeight: "900", fontSize: 12 },

  bottomControls: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
    marginBottom: 40,
  },
  btnBox: { alignItems: "center" },
  iconBtn: {
    width: 70,
    height: 70,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  btnLabel: {
    color: "white",
    fontSize: 11,
    fontWeight: "900",
    marginTop: 8,
  },
  mainNext: { paddingVertical: 18, paddingHorizontal: 35, borderRadius: 25 },
  nextText: { color: "black", fontWeight: "900", fontSize: 18 },
});
