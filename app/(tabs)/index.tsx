// app/(tabs)/index.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Platform,
  Share,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAudio } from "../_layout";

const NEXT_VIBE_MULTIPLIER = 0.4; // 40% of normal volume
const JOKE_HISTORY_KEY = "dadbot_joke_history_v1";
const FAVORITES_KEY = "favoriteJokes_v1";
const MAX_HISTORY = 200;

const { width, height } = Dimensions.get("window");

const SFX = {
  mid: require("../../assets/sound/mid.mp3"),
  fire: require("../../assets/sound/fire.mp3"),
  next: require("../../assets/sound/next.mp3"),
  shake: require("../../assets/sound/shake.mp3"),
} as const;

type SfxKey = keyof typeof SFX;

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

// ✅ Animated LinearGradient for pulsing transform
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient as any);

/** ---------- CONFETTI / EMOJI PARTICLES ---------- **/
const Particle = memo(function Particle({
  emoji,
  onComplete,
}: {
  emoji: string;
  onComplete: () => void;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.timing(anim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    });

    a.start(() => onComplete());
    return () => a.stop();
  }, [anim, onComplete]);

  const translateX = useMemo(
    () =>
      anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, (Math.random() - 0.5) * 450],
      }),
    [anim]
  );

  const translateY = useMemo(
    () =>
      anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, (Math.random() - 1) * 700],
      }),
    [anim]
  );

  const opacity = useMemo(
    () =>
      anim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [1, 1, 0],
      }),
    [anim]
  );

  const scale = useMemo(
    () =>
      anim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 3],
      }),
    [anim]
  );

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
});

const ParticlesLayer = memo(function ParticlesLayer({
  particles,
  onParticleDone,
}: {
  particles: { id: number; emoji: string }[];
  onParticleDone: (id: number) => void;
}) {
  return (
    <View style={styles.particleContainer} pointerEvents="none">
      {particles.map((p) => (
        <Particle key={p.id} emoji={p.emoji} onComplete={() => onParticleDone(p.id)} />
      ))}
    </View>
  );
});

/** ---------- MID: BETTER (SUBTLE) SMOKE PUFF ---------- **/
type SmokeBlob = {
  size: number;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  s0: number;
  s1: number;
  oPeak: number;
};

const SmokePuff = memo(function SmokePuff({
  originX,
  originY,
  drift = 0,
  onComplete,
}: {
  originX: number;
  originY: number;
  drift?: number;
  onComplete: () => void;
}) {
  const t = useRef(new Animated.Value(0)).current;

  // Seed blobs once so they don't "jump" on re-render
  const blobsRef = useRef<SmokeBlob[] | null>(null);
  if (!blobsRef.current) {
    const r = () => Math.random();
    blobsRef.current = Array.from({ length: 6 }).map(() => {
      const size = 24 + r() * 16; // 46..80
      const x0 = 35 + r() * 95; // within puff box
      const y0 = 55 + r() * 70;
      const dx = (r() - 0.5) * 28 + drift * 0.35;
      const dy = -(35 + r() * 15);
      const s0 = 0.75 + r() * 0.12;
      const s1 = 1.25 + r() * 0.18;
      const oPeak = 0.18 + r() * 0.18;
      return { size, x0, y0, dx, dy, s0, s1, oPeak };
    });
  }

  useEffect(() => {
    const a = Animated.timing(t, {
      toValue: 1,
      duration: 950,
      useNativeDriver: true,
    });
    a.start(() => onComplete());
    return () => a.stop();
  }, [t, onComplete]);

  const puffOpacity = useMemo(
    () =>
      t.interpolate({
        inputRange: [0, 0.12, 0.7, 1],
        outputRange: [0, 1, 0.9, 0],
      }),
    [t]
  );

  const puffScale = useMemo(
    () =>
      t.interpolate({
        inputRange: [0, 1],
        outputRange: [0.92, 1.05],
      }),
    [t]
  );

  const puffRise = useMemo(
    () =>
      t.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -85],
      }),
    [t]
  );

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.smokePuff,
        {
          left: originX,
          top: originY,
          opacity: puffOpacity,
          transform: [{ translateY: puffRise }, { scale: puffScale }],
        },
      ]}
    >
      {blobsRef.current.map((b, idx) => {
        const tx = t.interpolate({ inputRange: [0, 1], outputRange: [0, b.dx] });
        const ty = t.interpolate({ inputRange: [0, 1], outputRange: [0, b.dy] });
        const sc = t.interpolate({ inputRange: [0, 1], outputRange: [b.s0, b.s1] });

        const op = t.interpolate({
          inputRange: [0, 0.2, 0.75, 1],
          outputRange: [0, b.oPeak, b.oPeak * 0.8, 0],
        });

        const underOp = t.interpolate({
          inputRange: [0, 0.25, 0.8, 1],
          outputRange: [0, b.oPeak * 0.55, b.oPeak * 0.4, 0],
        });

        return (
          <React.Fragment key={idx}>
            <Animated.View
              style={[
                styles.smokeBlobSoft,
                {
                  width: b.size * 1.25,
                  height: b.size * 1.25,
                  left: b.x0 - b.size * 0.12,
                  top: b.y0 - b.size * 0.12,
                  opacity: underOp,
                  transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.smokeBlob,
                {
                  width: b.size,
                  height: b.size,
                  left: b.x0,
                  top: b.y0,
                  opacity: op,
                  transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }],
                },
              ]}
            />
          </React.Fragment>
        );
      })}
    </Animated.View>
  );
});

const SmokeLayer = memo(function SmokeLayer({
  puffs,
  onDone,
  originX,
  originY,
}: {
  puffs: { id: number; drift: number }[];
  onDone: (id: number) => void;
  originX: number;
  originY: number;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {puffs.map((p) => (
        <SmokePuff
          key={p.id}
          originX={originX}
          originY={originY}
          drift={p.drift}
          onComplete={() => onDone(p.id)}
        />
      ))}
    </View>
  );
});

/** ---------- FIRE: SUBTLE STARS BURST ---------- **/
const StarSpark = memo(function StarSpark({
  originX,
  originY,
  angle,
  distance,
  size,
  emoji,
  onComplete,
}: {
  originX: number;
  originY: number;
  angle: number;
  distance: number;
  size: number;
  emoji: string;
  onComplete: () => void;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.timing(anim, {
      toValue: 1,
      duration: 750,
      useNativeDriver: true,
    });

    a.start(() => onComplete());
    return () => a.stop();
  }, [anim, onComplete]);

  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;

  const translateX = useMemo(
    () =>
      anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, dx],
      }),
    [anim, dx]
  );

  const translateY = useMemo(
    () =>
      anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, dy],
      }),
    [anim, dy]
  );

  const opacity = useMemo(
    () =>
      anim.interpolate({
        inputRange: [0, 0.12, 1],
        outputRange: [0, 1, 0],
      }),
    [anim]
  );

  const scale = useMemo(
    () =>
      anim.interpolate({
        inputRange: [0, 0.25, 1],
        outputRange: [0.8, 1.05, 0.9],
      }),
    [anim]
  );

  return (
    <Animated.Text
      pointerEvents="none"
      style={[
        styles.starSpark,
        {
          left: originX,
          top: originY,
          fontSize: size,
          opacity,
          transform: [{ translateX }, { translateY }, { scale }],
        },
      ]}
    >
      {emoji}
    </Animated.Text>
  );
});

const StarsLayer = memo(function StarsLayer({
  bursts,
  onDone,
}: {
  bursts: {
    id: number;
    angle: number;
    distance: number;
    size: number;
    emoji: string;
  }[];
  onDone: (id: number) => void;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {bursts.map((b) => (
        <StarSpark
          key={b.id}
          originX={width * 0.78}
          originY={height * 0.78}
          angle={b.angle}
          distance={b.distance}
          size={b.size}
          emoji={b.emoji}
          onComplete={() => onDone(b.id)}
        />
      ))}
    </View>
  );
});

/** ---------- UI ---------- **/
const NavBar = memo(function NavBar({
  groans,
  bgmOn,
  setBgmOn,
  muted,
  onToggleMute,
  onOpenModal,
  onShare,
  shareDisabled,
  isOffline,
}: {
  groans: number;
  bgmOn: boolean;
  setBgmOn: (v: boolean) => void;
  muted: boolean;
  onToggleMute: () => void;
  onOpenModal: () => void;
  onShare: () => void;
  shareDisabled: boolean;
  isOffline: boolean;
}) {
  const groanWidth = useMemo<`${number}%`>(() => `${Math.min(groans * 10, 100)}%`, [groans]);

  return (
    <View style={styles.navBar}>
      <View>
        <Text style={styles.tinyLabel}>GROAN-O-METER</Text>
        <View style={styles.groanBar}>
          <View style={[styles.groanFill, { width: groanWidth }]} />
        </View>

        <View style={styles.audioRow}>
          <Text style={styles.bgmLabel}>BGM</Text>
          <Switch
            value={bgmOn}
            onValueChange={setBgmOn}
            thumbColor={Platform.OS === "android" ? (bgmOn ? "#bcff00" : "#888") : undefined}
            trackColor={{
              false: "rgba(255,255,255,0.2)",
              true: "rgba(188,255,0,0.35)",
            }}
          />

          <TouchableOpacity
            style={[styles.muteBtn, muted && styles.muteBtnActive]}
            onPress={onToggleMute}
            activeOpacity={0.85}
          >
            <Text style={styles.muteIcon}>{muted ? "🔇" : "🔊"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.rightControls}>
        <TouchableOpacity style={styles.smallBtn} onPress={onOpenModal} activeOpacity={0.8}>
          <Text style={styles.smallBtnText}>MSC</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.smallBtn, shareDisabled && { opacity: 0.45 }]}
          onPress={onShare}
          activeOpacity={0.8}
        >
          <Text style={styles.smallBtnText}>SHARE</Text>
        </TouchableOpacity>

        {isOffline && (
          <Text style={[styles.devIconText, styles.devIconOffline]} pointerEvents="none">
            📴
          </Text>
        )}
      </View>
    </View>
  );
});

const JokeCard = memo(function JokeCard({
  loading,
  joke,
  favoriteDisabled,
  isFavorited,
  onToggleFavorite,
  favoritesCount,
  onOpenFavorites,
  streak,
}: {
  loading: boolean;
  joke: string;
  favoriteDisabled: boolean;
  isFavorited: boolean;
  onToggleFavorite: () => void;
  favoritesCount: number;
  onOpenFavorites: () => void;
  streak: number;
}) {
  return (
    <>
      <View style={styles.miniStreakContainer}>
        <Text style={styles.miniStreakText}>🔥 {streak} STREAK</Text>
      </View>

      <View style={styles.card}>
        {loading ? (
          <ActivityIndicator size="large" color="#00f0ff" />
        ) : (
          <Text style={styles.jokeTxt}>{joke}</Text>
        )}

        <TouchableOpacity
          style={[styles.favBtn, favoriteDisabled && { opacity: 0.35 }]}
          onPress={onToggleFavorite}
          activeOpacity={0.85}
          disabled={favoriteDisabled}
        >
          <Text style={[styles.favIcon, isFavorited && styles.favIconActive]}>
            {isFavorited ? "💙✨" : "💖✨"}
          </Text>
        </TouchableOpacity>

        {favoritesCount > 0 && (
          <TouchableOpacity style={styles.favCount} onPress={onOpenFavorites} activeOpacity={0.8}>
            <Text style={styles.favCountText}>{favoritesCount}</Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );
});

const BottomControls = memo(function BottomControls({
  reactionBlocked,
  onMid,
  onFire,
  onNext,
  midMeasureRef,
  onMidLayout,
}: {
  reactionBlocked: boolean;
  onMid: () => void;
  onFire: () => void;
  onNext: () => void;
  midMeasureRef: React.RefObject<View>;
  onMidLayout: () => void;
}) {
  // ✅ Pulse forever
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 850,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  const glowOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.15, 0.35],
  });

  return (
    <View style={styles.bottomControls}>
      <View style={styles.btnBox}>
        {/* Wrapper is used for accurate measuring */}
        <View ref={midMeasureRef} onLayout={onMidLayout} collapsable={false}>
          <TouchableOpacity
            style={[styles.iconBtn, reactionBlocked && { opacity: 0.35 }]}
            onPress={onMid}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 35 }}>💀</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.btnLabel}>MID</Text>
      </View>

      {/* ✅ NEXT: pulsing only */}
      <TouchableOpacity onPress={onNext} activeOpacity={0.75}>
        <Animated.View
          style={[
            styles.nextWrap,
            {
              transform: [{ scale: pulseScale }],
            },
          ]}
        >
          {/* soft glow */}
          <Animated.View style={[styles.nextGlow, { opacity: glowOpacity }]} pointerEvents="none" />

          <AnimatedLinearGradient colors={["#bcff00", "#00f0ff"]} style={styles.mainNext}>
            <Text style={styles.nextText}>NEXT VIBE</Text>
          </AnimatedLinearGradient>
        </Animated.View>
      </TouchableOpacity>

      <View style={styles.btnBox}>
        <TouchableOpacity
          style={[styles.iconBtn, reactionBlocked && { opacity: 0.35 }]}
          onPress={onFire}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 35 }}>🦄</Text>
        </TouchableOpacity>
        <Text style={styles.btnLabel}>FIRE</Text>
      </View>
    </View>
  );
});

/** ---------- SCREEN ---------- **/
export default function Index() {
  const router = useRouter();
  const { bgmOn, setBgmOn, muted, setMuted, sfxVolume } = useAudio();

  const [jokeHistory, setJokeHistory] = useState<string[]>([]);
  const [joke, setJoke] = useState("VIBE CHECK...");
  const [isRealJoke, setIsRealJoke] = useState(false);
  const [loading, setLoading] = useState(false);
  const [streak, setStreak] = useState(0);
  const [groans, setGroans] = useState(0);
  const [particles, setParticles] = useState<{ id: number; emoji: string }[]>([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const [isOffline, setIsOffline] = useState(false);

  // MID smoke + FIRE stars
  const [smokePuffs, setSmokePuffs] = useState<{ id: number; drift: number }[]>([]);
  const [starBursts, setStarBursts] = useState<
    { id: number; angle: number; distance: number; size: number; emoji: string }[]
  >([]);

  const onSmokeDone = useCallback((id: number) => {
    setSmokePuffs((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const onStarDone = useCallback((id: number) => {
    setStarBursts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // ---------- measure MID button so smoke comes FROM BEHIND it ----------
  const containerRef = useRef<View>(null);
  const midMeasureRef = useRef<View>(null);

  // window coords of container (ref)
  const containerWinRef = useRef({ x: 0, y: 0 });

  // measured center of MID button in container coords (state so render updates)
  const [midCenter, setMidCenter] = useState<{ x: number; y: number }>({
    x: width * 0.13,
    y: height * 0.78,
  });

  const measureContainer = useCallback(() => {
    containerRef.current?.measureInWindow((x, y) => {
      containerWinRef.current = { x, y };
    });
  }, []);

  const measureMidButton = useCallback(() => {
    // Use wrapper View for stable measurement
    midMeasureRef.current?.measureInWindow((x, y, w, h) => {
      const cx = x + w / 2 - containerWinRef.current.x;
      const cy = y + h / 2 - containerWinRef.current.y;
      setMidCenter({ x: cx, y: cy });
    });
  }, []);

  const handleRootLayout = useCallback(() => {
    // Layout -> measure both (use RAF to ensure positions are final)
    requestAnimationFrame(() => {
      measureContainer();
      measureMidButton();
    });
  }, [measureContainer, measureMidButton]);

  const handleMidLayout = useCallback(() => {
    requestAnimationFrame(() => {
      measureContainer();
      measureMidButton();
    });
  }, [measureContainer, measureMidButton]);

  useEffect(() => {
    // initial measure
    requestAnimationFrame(() => {
      measureContainer();
      measureMidButton();
    });
  }, [measureContainer, measureMidButton]);

  // Refs
  const sfxRef = useRef<Partial<Record<SfxKey, Audio.Sound>>>({});
  const jokeHistoryRef = useRef<string[]>([]);
  const loadingRef = useRef(false);
  const mutedRef = useRef(false);
  const sfxVolumeRef = useRef(1);

  // Transient message helpers
  const transientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transientTokenRef = useRef(0);
  const snapshotRef = useRef<{ joke: string; isRealJoke: boolean }>({
    joke: "VIBE CHECK...",
    isRealJoke: false,
  });

  const showTransientMessage = useCallback(
    (text: string, ms = 600) => {
      snapshotRef.current = { joke, isRealJoke };

      if (transientTimerRef.current) clearTimeout(transientTimerRef.current);

      const token = ++transientTokenRef.current;

      setJoke(text);
      setIsRealJoke(false);

      transientTimerRef.current = setTimeout(() => {
        if (transientTokenRef.current !== token) return;
        setJoke(snapshotRef.current.joke);
        setIsRealJoke(snapshotRef.current.isRealJoke);
      }, ms);
    },
    [isRealJoke, joke]
  );

  useEffect(() => {
    return () => {
      if (transientTimerRef.current) clearTimeout(transientTimerRef.current);
    };
  }, []);

  // Keep refs in sync
  useEffect(() => {
    jokeHistoryRef.current = jokeHistory;
  }, [jokeHistory]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    sfxVolumeRef.current = sfxVolume;
  }, [sfxVolume]);

  // Offline detection
  useEffect(() => {
    NetInfo.fetch().then((state) => {
      setIsOffline(!(state.isConnected === true));
    });

    const unsub = NetInfo.addEventListener((state) => {
      setIsOffline(!(state.isConnected === true));
    });

    return () => unsub();
  }, []);

  // Favorites
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(FAVORITES_KEY);
        if (!raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setFavorites(parsed.filter((x) => typeof x === "string") as string[]);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)).catch(() => {});
  }, [favorites]);

  // History
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(JOKE_HISTORY_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter((x) => typeof x === "string") as string[];
          setJokeHistory(cleaned);
          jokeHistoryRef.current = cleaned;
        }
      } catch {
        setJokeHistory([]);
        jokeHistoryRef.current = [];
      }
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(JOKE_HISTORY_KEY, JSON.stringify(jokeHistory)).catch(() => {});
  }, [jokeHistory]);

  // Load SFX
  useEffect(() => {
    let mounted = true;

    const loadSfx = async () => {
      try {
        await configureAudioModeForSfx();
        for (const [key, file] of Object.entries(SFX) as [SfxKey, any][]) {
          const { sound } = await Audio.Sound.createAsync(file, { volume: 1.0 });
          if (!mounted) {
            sound.unloadAsync().catch(() => {});
            continue;
          }
          sfxRef.current[key] = sound;
        }
      } catch (e) {
        if (__DEV__) console.log("SFX load error:", e);
      }
    };

    loadSfx();

    return () => {
      mounted = false;
      Object.values(sfxRef.current).forEach((s) => s?.unloadAsync().catch(() => {}));
      sfxRef.current = {};
    };
  }, []);

  // Apply SFX volume/mute
  useEffect(() => {
    const v = muted ? 0 : sfxVolume;
    Object.values(sfxRef.current).forEach((s) => s?.setVolumeAsync(v).catch(() => {}));
  }, [sfxVolume, muted]);

  const playSfx = useCallback(async (key: SfxKey) => {
    try {
      if (mutedRef.current) return;

      const s = sfxRef.current[key];
      if (!s) return;

      const base = Math.max(0, Math.min(1, sfxVolumeRef.current));
      const volume =
        key === "next" ? Math.max(0, Math.min(1, base * NEXT_VIBE_MULTIPLIER)) : base;

      await s.setVolumeAsync(volume);
      await s.replayAsync();
    } catch (e) {
      if (__DEV__) console.log("SFX playback error:", e);
    }
  }, []);

  const triggerShake = useCallback(() => {
    playSfx("shake");
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 15, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -15, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [playSfx, shakeAnim]);

  const fetchJoke = useCallback(async () => {
    playSfx("next");
    setLoading(true);

    try {
      const response = await fetch("https://icanhazdadjoke.com/", {
        headers: { Accept: "application/json" },
      });
      const data: any = await response.json();

      const nextJoke = typeof data?.joke === "string" ? data.joke : "No joke returned 😅";
      setJoke(nextJoke);
      setIsRealJoke(typeof data?.joke === "string");

      if (typeof data?.joke === "string") {
        setJokeHistory((prev) => {
          const next = [nextJoke, ...prev.filter((j) => j !== nextJoke)];
          const sliced = next.slice(0, MAX_HISTORY);
          jokeHistoryRef.current = sliced;
          return sliced;
        });
      }
    } catch {
      setJoke("Check your signal, fam 📴");
      setIsRealJoke(false);
    } finally {
      setLoading(false);
    }
  }, [playSfx]);

  const onParticleDone = useCallback((id: number) => {
    setParticles((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const toggleFavorite = useCallback(() => {
    if (!isRealJoke || loadingRef.current) return;

    setFavorites((prev) => {
      if (prev.includes(joke)) return prev.filter((j) => j !== joke);
      const next = [joke, ...prev.filter((j) => j !== joke)];
      return next.slice(0, MAX_HISTORY);
    });
  }, [isRealJoke, joke]);

  const handleAction = useCallback(
    (type: "mid" | "fire") => {
      playSfx(type);

      if (type === "mid") {
        setSmokePuffs((prev) => [
          ...prev,
          { id: Math.random(), drift: (Math.random() - 0.5) * 24 },
        ]);

        setGroans((prev) => {
          const next = prev + 1;
          if (next >= 10) {
            triggerShake();
            return 0;
          }
          return next;
        });

        setStreak(0);

        setParticles((p) => [
          ...p,
          ...Array.from({ length: 12 }).map((_, i) => ({
            id: Math.random() + i,
            emoji: "💀",
          })),
        ]);
      } else {
        const STAR_EMOJIS = ["✨", "⭐️"];

        setStarBursts((prev) => [
          ...prev,
          ...Array.from({ length: 6 }).map((_, i) => ({
            id: Math.random() + i,
            angle: Math.random() * Math.PI * 2,
            distance: 35 + Math.random() * 55,
            size: 12 + Math.random() * 6,
            emoji: STAR_EMOJIS[Math.floor(Math.random() * STAR_EMOJIS.length)],
          })),
        ]);

        setStreak((prev) => prev + 1);

        setParticles((p) => [
          ...p,
          ...Array.from({ length: 12 }).map((_, i) => ({
            id: Math.random() + i,
            emoji: "😂",
          })),
        ]);
      }
    },
    [playSfx, triggerShake]
  );

  const shareDisabled = loading || !isRealJoke;
  const favoriteDisabled = loading || !isRealJoke;
  const reactionBlocked = loading || !isRealJoke;

  const isFavorited = useMemo(
    () => isRealJoke && favorites.includes(joke),
    [favorites, isRealJoke, joke]
  );

  const onToggleMute = useCallback(() => setMuted(!muted), [setMuted, muted]);
  const onOpenModal = useCallback(() => router.push("/modal"), [router]);
  const onOpenFavorites = useCallback(() => router.push("/favorites"), [router]);

  const onShare = useCallback(() => {
    if (shareDisabled) {
      showTransientMessage("Get a real joke first 😅");
      return;
    }
    Share.share({ message: joke }).catch(() => {});
  }, [joke, shareDisabled, showTransientMessage]);

  const onMid = useCallback(() => {
    if (reactionBlocked) {
      showTransientMessage("You gremlin 😈 get a real joke first.");
      return;
    }
    handleAction("mid");
  }, [handleAction, reactionBlocked, showTransientMessage]);

  const onFire = useCallback(() => {
    if (reactionBlocked) {
      showTransientMessage("You gremlin 😈 get a real joke first.");
      return;
    }
    handleAction("fire");
  }, [handleAction, reactionBlocked, showTransientMessage]);

  // SmokePuff box is 220x220, so subtract half to center it behind button.
  const PUFF_HALF = 110;
  const smokeOriginX = midCenter.x - PUFF_HALF;
  const smokeOriginY = midCenter.y - PUFF_HALF;

  return (
    <View ref={containerRef} style={styles.container} onLayout={handleRootLayout}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.blob, { top: -50, left: -50, backgroundColor: "#ff007a" }]} />
      <View style={[styles.blob, { bottom: -50, right: -50, backgroundColor: "#00f0ff" }]} />

      {/* Overlays */}
      <ParticlesLayer particles={particles} onParticleDone={onParticleDone} />
      <SmokeLayer
        puffs={smokePuffs}
        onDone={onSmokeDone}
        originX={smokeOriginX}
        originY={smokeOriginY}
      />
      <StarsLayer bursts={starBursts} onDone={onStarDone} />

      <NavBar
        groans={groans}
        bgmOn={bgmOn}
        setBgmOn={setBgmOn}
        muted={muted}
        onToggleMute={onToggleMute}
        onOpenModal={onOpenModal}
        onShare={onShare}
        shareDisabled={shareDisabled}
        isOffline={isOffline}
      />

      <Animated.View style={[styles.cardContainer, { transform: [{ translateX: shakeAnim }] }]}>
        <JokeCard
          loading={loading}
          joke={joke}
          favoriteDisabled={favoriteDisabled}
          isFavorited={isFavorited}
          onToggleFavorite={toggleFavorite}
          favoritesCount={favorites.length}
          onOpenFavorites={onOpenFavorites}
          streak={streak}
        />
      </Animated.View>

      <BottomControls
        reactionBlocked={reactionBlocked}
        onMid={onMid}
        onFire={onFire}
        onNext={fetchJoke}
        midMeasureRef={midMeasureRef}
        onMidLayout={handleMidLayout}
      />
    </View>
  );
}

/** ---------- STYLES ---------- **/
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

  // Smoke (better)
  smokePuff: {
    position: "absolute",
    width: 220,
    height: 220,
  },
  smokeBlob: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(127,159,42,0.65)",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#7f9f2a",
          shadowOpacity: 0.25,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 0 },
        }
      : { elevation: 2 }),
  },
  smokeBlobSoft: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(127,159,42,0.30)",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#7f9f2a",
          shadowOpacity: 0.18,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 0 },
        }
      : { elevation: 1 }),
  },

  // Stars (subtle)
  starSpark: {
    position: "absolute",
    textShadowColor: "rgba(255,255,255,0.55)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },

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

  // ✅ NEXT pulsing wrapper + glow
  nextWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  nextGlow: {
    position: "absolute",
    width: 190,
    height: 64,
    borderRadius: 28,
    backgroundColor: "rgba(0,240,255,0.22)",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#00f0ff",
          shadowOpacity: 0.35,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 0 },
        }
      : { elevation: 3 }),
  },

  mainNext: { paddingVertical: 18, paddingHorizontal: 35, borderRadius: 25 },
  nextText: { color: "black", fontWeight: "900", fontSize: 18 },

  devIconText: { fontSize: 26, fontWeight: "900" },
  devIconOffline: { color: "#ff9500" },
});
