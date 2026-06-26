// app/_layout.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Audio,
  InterruptionModeAndroid,
  InterruptionModeIOS
} from "expo-av";
import { Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  AppState,
  Easing,
  Image,
  Platform,
  StyleSheet,
  View,
} from "react-native";
;


// Prevent native splash from auto-hiding (we will hide it ourselves)
SplashScreen.preventAutoHideAsync().catch(() => {});

// ✅ Built-in tracks
const BUILTIN_TRACKS = {
  house: require("../assets/sound/bg_house.mp3"),
  relax: require("../assets/sound/bg_relax.mp3"),
  funky: require("../assets/sound/bg_funky.mp3"),
  blues: require("../assets/sound/bg_blues.mp3"),
  lofi: require("../assets/sound/bg_lofi.mp3"),
  lounge: require("../assets/sound/bg_lounge.mp3"),
  thuglife: require("../assets/sound/bg_thuglife.mp3"),
} as const;

type BuiltinKey = keyof typeof BUILTIN_TRACKS;

type UserTrack = {
  id: string;
  name: string;
  uri: string;
};

type TrackKey = string;

type AudioContextType = {
  bgmOn: boolean;
  setBgmOn: (v: boolean) => void;

  trackKey: TrackKey;
  setTrackKey: (k: TrackKey) => void;
  trackKeys: TrackKey[];

  getTrackLabel: (k: TrackKey) => string;
  isUserTrack: (k: TrackKey) => boolean;

  userTracks: UserTrack[];
  addUserTrack: (t: { name: string; uri: string }) => Promise<void>;
  removeUserTrack: (id: string) => Promise<void>;

  muted: boolean;
  setMuted: (v: boolean) => void;

  bgmVolume: number; // 0..1
  setBgmVolume: (v: number) => void;

  sfxVolume: number; // 0..1
  setSfxVolume: (v: number) => void;
};

const AudioCtx = createContext<AudioContextType | null>(null);

export function useAudio() {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error("useAudio must be used inside app/_layout.tsx");
  return ctx;
}

const STORAGE_KEYS = {
  bgmOn: "bgmOn",
  trackKey: "bgmTrackKey",
  muted: "audioMuted",
  bgmVolume: "bgmVolume",
  sfxVolume: "sfxVolume",
  userTracks: "userTracks_v1",
};

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

async function configureAudioMode() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

function makeUserKey(id: string) {
  return `user:${id}`;
}
function parseUserId(trackKey: string) {
  if (!trackKey.startsWith("user:")) return null;
  return trackKey.slice("user:".length);
}

function AudioProvider({ children }: { children: React.ReactNode }) {
  const builtinKeys = useMemo(
    () => Object.keys(BUILTIN_TRACKS) as BuiltinKey[],
    []
  );

  // 🔥 User tracks
  const [userTracks, setUserTracks] = useState<UserTrack[]>([]);

  // Preferences
  const [bgmOn, setBgmOn] = useState(true);
  const [trackKey, setTrackKey] = useState<TrackKey>("relax");
  const [muted, setMuted] = useState(false);
  const [bgmVolume, setBgmVolumeState] = useState(0.35);
  const [sfxVolume, setSfxVolumeState] = useState(0.55);

  const [hydrated, setHydrated] = useState(false);

  // Player refs
  const soundRef = useRef<Audio.Sound | null>(null);
  const opIdRef = useRef(0);

  // Refs for safe async callbacks
    const mutedRef = useRef(false);
  const bgmOnRef = useRef(true);
  const trackKeyRef = useRef<TrackKey>(trackKey);
  const bgmVolumeRef = useRef(bgmVolume);

  // should resume when coming back active?
  const shouldResumeRef = useRef(false);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

    useEffect(() => {
    bgmVolumeRef.current = bgmVolume;
  }, [bgmVolume]);

  useEffect(() => {
    trackKeyRef.current = trackKey;
  }, [trackKey]);

  useEffect(() => {
  bgmOnRef.current = bgmOn;

  // Important: if BGM is off, never allow AppState resume to start it
  if (!bgmOn) shouldResumeRef.current = false;
}, [bgmOn]);

  const trackKeys = useMemo(() => {
    const userKeys = userTracks.map((t) => makeUserKey(t.id));
    return [...builtinKeys, ...userKeys];
  }, [builtinKeys, userTracks]);

  const isUserTrack = (k: TrackKey) => k.startsWith("user:");

  const getTrackLabel = (k: TrackKey) => {
    if (!isUserTrack(k)) return k;
    const id = parseUserId(k);
    const found = userTracks.find((t) => t.id === id);
    return found?.name ?? "Uploaded track";
  };

  // --- Load saved prefs (including user tracks) ---
  useEffect(() => {
    (async () => {
      try {
        const savedUserTracks = await AsyncStorage.getItem(
          STORAGE_KEYS.userTracks
        );
        if (savedUserTracks) {
          const parsed = JSON.parse(savedUserTracks);
          if (Array.isArray(parsed)) {
            setUserTracks(
              parsed.filter(
                (x) =>
                  x &&
                  typeof x === "object" &&
                  typeof x.id === "string" &&
                  typeof x.name === "string" &&
                  typeof x.uri === "string"
              )
            );
          }
        }

        const savedOn = await AsyncStorage.getItem(STORAGE_KEYS.bgmOn);
        const savedTrack = await AsyncStorage.getItem(STORAGE_KEYS.trackKey);
        const savedMuted = await AsyncStorage.getItem(STORAGE_KEYS.muted);
        const savedBgmVol = await AsyncStorage.getItem(STORAGE_KEYS.bgmVolume);
        const savedSfxVol = await AsyncStorage.getItem(STORAGE_KEYS.sfxVolume);

        if (savedOn !== null) setBgmOn(savedOn === "true");
        if (savedMuted !== null) setMuted(savedMuted === "true");
        if (savedBgmVol !== null)
          setBgmVolumeState(clamp01(parseFloat(savedBgmVol)));
        if (savedSfxVol !== null)
          setSfxVolumeState(clamp01(parseFloat(savedSfxVol)));

        if (savedTrack) setTrackKey(savedTrack);
      } catch {
        // ignore
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  // Validate trackKey if it points to removed user track
  useEffect(() => {
    if (!trackKey) return;
    if (!isUserTrack(trackKey)) return;

    const id = parseUserId(trackKey);
    if (!id) return;

    const exists = userTracks.some((t) => t.id === id);
    if (!exists) setTrackKey("relax");
  }, [trackKey, userTracks]);

  // Save prefs
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEYS.bgmOn, String(bgmOn)).catch(() => {});
  }, [bgmOn, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEYS.trackKey, trackKey).catch(() => {});
  }, [trackKey, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEYS.muted, String(muted)).catch(() => {});
  }, [muted, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(
      STORAGE_KEYS.bgmVolume,
      String(clamp01(bgmVolume))
    ).catch(() => {});
  }, [bgmVolume, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(
      STORAGE_KEYS.sfxVolume,
      String(clamp01(sfxVolume))
    ).catch(() => {});
  }, [sfxVolume, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(
      STORAGE_KEYS.userTracks,
      JSON.stringify(userTracks)
    ).catch(() => {});
  }, [userTracks, hydrated]);

  // --- User track management ---
  const addUserTrack = async (t: { name: string; uri: string }) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const newTrack: UserTrack = { id, name: t.name, uri: t.uri };
    setUserTracks((prev) => [newTrack, ...prev]);
    setTrackKey(makeUserKey(id));
  };

  const removeUserTrack = async (id: string) => {
    const keyToRemove = makeUserKey(id);
    setUserTracks((prev) => prev.filter((t) => t.id !== id));
    if (trackKeyRef.current === keyToRemove) setTrackKey("relax");
  };

  // --- Playback controls ---
  const stopAndUnload = async () => {
    opIdRef.current++;
    if (!soundRef.current) return;

    try {
      const st: any = await soundRef.current.getStatusAsync();
      if (st?.isLoaded) await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
    } catch {}
    soundRef.current = null;
  };

  const pauseOnly = async () => {
    if (!soundRef.current) return;
    try {
      const st: any = await soundRef.current.getStatusAsync();
      if (st?.isLoaded && st.isPlaying) await soundRef.current.pauseAsync();
    } catch {}
  };

  const attachLoopGuard = (sound: Audio.Sound) => {
    sound.setOnPlaybackStatusUpdate((status: any) => {
      if (!status?.isLoaded) return;
      if (status.didJustFinish) {
        if (bgmOnRef.current && !mutedRef.current) {
          sound.replayAsync().catch(() => {});
        }
      }
    });
  };

  const ensureBgmVolume = async () => {
    if (!soundRef.current) return;
    try {
      const st: any = await soundRef.current.getStatusAsync();
      if (!st?.isLoaded) return;

      const target = mutedRef.current ? 0 : clamp01(bgmVolumeRef.current);
      await soundRef.current.setVolumeAsync(target);
    } catch {}
  };

  const getSourceForTrackKey = (k: TrackKey): any => {
    if (!isUserTrack(k)) {
      const builtin = BUILTIN_TRACKS[k as BuiltinKey];
      return builtin ?? BUILTIN_TRACKS.relax;
    }
    const id = parseUserId(k);
    const found = userTracks.find((t) => t.id === id);
    if (!found) return BUILTIN_TRACKS.relax;
    return { uri: found.uri };
  };

  const startFromBeginning = async () => {
    const myOp = ++opIdRef.current;

    await configureAudioMode();
    if (myOp !== opIdRef.current) return;

    if (!hydrated) return;

    if (!bgmOnRef.current) {
      await stopAndUnload();
      return;
    }

    if (mutedRef.current) {
      await pauseOnly();
      await ensureBgmVolume();
      return;
    }

    if (soundRef.current) {
      const st: any = await soundRef.current.getStatusAsync();
      if (st?.isLoaded) {
        await ensureBgmVolume();
        if (!st.isPlaying) await soundRef.current.playAsync();
      }
      return;
    }

    const k = trackKeyRef.current;
    const source = getSourceForTrackKey(k);

    const { sound } = await Audio.Sound.createAsync(source, {
      shouldPlay: false,
      isLooping: true,
      volume: clamp01(bgmVolumeRef.current),
    });

    try {
      await sound.setIsLoopingAsync(true);
    } catch {}

    attachLoopGuard(sound);

    if (myOp !== opIdRef.current) {
      await sound.unloadAsync();
      return;
    }

    soundRef.current = sound;

    try {
      await sound.setPositionAsync(0);
    } catch {}

    await ensureBgmVolume();
    await sound.playAsync();
  };

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (!hydrated) return;

      if (state === "background" || state === "inactive") {
  shouldResumeRef.current =
    !!bgmOnRef.current &&
    !mutedRef.current &&
    clamp01(bgmVolumeRef.current) > 0;
  await pauseOnly();
  return;
}

      if (state === "active") {
  // If BGM is off, never resume even if shouldResumeRef was set earlier
  if (!bgmOnRef.current) {
    shouldResumeRef.current = false;
    return;
  }

  if (shouldResumeRef.current && !mutedRef.current) {
    await startFromBeginning();
  }
  shouldResumeRef.current = false;
}

    });

    return () => sub.remove();
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;

    if (!bgmOn) {
      stopAndUnload();
      return;
    }

    if (muted) {
      pauseOnly();
      ensureBgmVolume();
      return;
    }

    startFromBeginning();
  }, [bgmOn, muted, hydrated]);

  useEffect(() => {
    if (!hydrated) return;

    (async () => {
      if (!bgmOnRef.current) {
        await stopAndUnload();
        return;
      }

      await stopAndUnload();

      if (mutedRef.current) return;

      await startFromBeginning();
    })();
  }, [trackKey, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    ensureBgmVolume();
  }, [bgmVolume, muted, hydrated]);

  useEffect(() => {
    return () => {
      stopAndUnload();
    };
  }, []);

  const value = useMemo<AudioContextType>(
    () => ({
      bgmOn,
      setBgmOn,
      trackKey,
      setTrackKey,
      trackKeys,
      getTrackLabel,
      isUserTrack,
      userTracks,
      addUserTrack,
      removeUserTrack,
      muted,
      setMuted,
      bgmVolume,
      setBgmVolume: (v) => setBgmVolumeState(clamp01(v)),
      sfxVolume,
      setSfxVolume: (v) => setSfxVolumeState(clamp01(v)),
    }),
    [bgmOn, trackKey, trackKeys, muted, bgmVolume, sfxVolume, userTracks]
  );

  return <AudioCtx.Provider value={value}>{children}</AudioCtx.Provider>;
}

function SplashOverlay({
  opacity,
  onDone,
}: {
  opacity: Animated.Value;
  onDone: () => void;
}) {
  const HOLD_IMAGE_MS = 5000; // <- increase this if you want splash.png to stay longer
  const FADE_MS = 2500;

  const fadeStartedRef = useRef(false);

  const startFade = useCallback(() => {
    if (fadeStartedRef.current) return;
    fadeStartedRef.current = true;

    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => onDone());
  }, [opacity, onDone]);

  useEffect(() => {
    const t = setTimeout(() => {
      startFade();
    }, HOLD_IMAGE_MS);

    return () => clearTimeout(t);
  }, [startFade]);

  return (
    <Animated.View style={[styles.overlay, { opacity }]} pointerEvents="none">
      <Image
        source={require("../assets/images/splash.png")}
        style={styles.splashImage}
        resizeMode="cover"
      />
    </Animated.View>
  );
}



export default function RootLayout() {
  const [showOverlay, setShowOverlay] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;

  const pathname = usePathname();
  const isModalRoute = pathname === "/modal";

  // Ensure audio mode is set once early (prevents SFX glitches)
  const audioModeReadyRef = useRef(false);

  useEffect(() => {
    (async () => {
      await SplashScreen.hideAsync().catch(() => {});
      if (!audioModeReadyRef.current) {
        audioModeReadyRef.current = true;
        await configureAudioMode().catch(() => {});
      }
    })();
  }, []);

  // ✅ CRITICAL: If modal is opened while splash overlay is still active,
  // disable overlay permanently to prevent flash on returning from modal.
  useEffect(() => {
    if (isModalRoute && showOverlay) {
      setShowOverlay(false);
      opacity.setValue(0);
    }
  }, [isModalRoute, showOverlay, opacity]);

  return (
    <AudioProvider>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#000" }, // ✅ prevents white flash
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

          <Stack.Screen
            name="modal"
            options={{
              presentation: "modal",
              headerShown: false,
              animation: Platform.OS === "ios" ? "slide_from_bottom" : "fade",
              contentStyle: { backgroundColor: "#000" }, // ✅ modal background
            }}
          />

          <Stack.Screen name="favorites" options={{ headerShown: false }} />
        </Stack>

        {/* ✅ Don’t render overlay while modal is open */}
        {showOverlay && !isModalRoute && (
          <SplashOverlay opacity={opacity} onDone={() => setShowOverlay(false)} />
        )}
      </View>
    </AudioProvider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
  },
  splashImage: {
    width: "100%",
    height: "100%",
  },
});
