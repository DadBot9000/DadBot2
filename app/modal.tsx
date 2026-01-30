import Slider from "@react-native-community/slider";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAudio } from "./_layout";

const BUILTIN_LABELS: Record<string, string> = {
  house: "House",
  relax: "Relax",
  funky: "Funky",
  blues: "Blues",
  lofi: "Lo-Fi",
  lounge: "Lounge",
  thuglife: "Thug Life",
};

export default function Modal() {
  const router = useRouter();
  const {
    bgmOn,
    setBgmOn,
    trackKey,
    setTrackKey,
    trackKeys,

    muted,
    setMuted,
    bgmVolume,
    setBgmVolume,
    sfxVolume,
    setSfxVolume,

    getTrackLabel,
    isUserTrack,
    addUserTrack,
    removeUserTrack,
  } = useAudio();

  // ✅ Toggle menu for large track lists
  const [tracksOpen, setTracksOpen] = useState(true);

  const displayLabel = useMemo(() => {
    if (!isUserTrack(trackKey)) return BUILTIN_LABELS[trackKey] ?? trackKey;
    return getTrackLabel(trackKey);
  }, [trackKey, getTrackLabel, isUserTrack]);

  const onUpload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (res.canceled) return;

      const file = res.assets?.[0];
      if (!file?.uri) return;

      const name = (file.name ?? "Uploaded Track").replace(/\.[^/.]+$/, ""); // remove extension
      await addUserTrack({ name, uri: file.uri });
      setTracksOpen(true);
    } catch (e) {
      console.log("Upload error:", e);
    }
  };

  const onRemoveUserTrack = async (k: string) => {
    const id = k.startsWith("user:") ? k.slice("user:".length) : null;
    if (!id) return;
    await removeUserTrack(id);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Music</Text>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.muteBtn, muted && styles.muteBtnActive]}
            onPress={() => setMuted(!muted)}
            activeOpacity={0.85}
          >
            <Text style={styles.muteIcon}>{muted ? "🔇" : "🔊"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.closeText}>CLOSE</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Background Music</Text>
        <TouchableOpacity
          style={[styles.pill, bgmOn ? styles.pillOn : styles.pillOff]}
          onPress={() => setBgmOn(!bgmOn)}
          activeOpacity={0.8}
        >
          <Text style={styles.pillText}>{bgmOn ? "ON" : "OFF"}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>Volumes</Text>

      <View style={styles.sliderBlock}>
        <Text style={styles.sliderLabel}>BGM Volume</Text>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={1}
          value={bgmVolume}
          onValueChange={setBgmVolume}
          minimumTrackTintColor="rgba(188,255,0,1)"
          thumbTintColor="rgba(188,255,0,1)"
        />
      </View>

      <View style={styles.sliderBlock}>
        <Text style={styles.sliderLabel}>SFX Volume</Text>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={1}
          value={sfxVolume}
          onValueChange={setSfxVolume}
          minimumTrackTintColor="rgba(255,0,200,0.95)"
          thumbTintColor="rgba(255,0,200,1)"
        />
      </View>

      {/* ✅ Track menu header + toggle */}
      <View style={styles.tracksHeader}>
        <View>
          <Text style={styles.subtitle}>Tracks</Text>
          <Text style={styles.currentTrack}>Now: {displayLabel}</Text>
        </View>

        <TouchableOpacity
          style={styles.toggleBtn}
          onPress={() => setTracksOpen((v) => !v)}
          activeOpacity={0.85}
        >
          <Text style={styles.toggleBtnText}>{tracksOpen ? "HIDE" : "SHOW"}</Text>
        </TouchableOpacity>
      </View>

      {/* ✅ Upload button */}
      <TouchableOpacity style={styles.uploadBtn} onPress={onUpload} activeOpacity={0.85}>
        <Text style={styles.uploadBtnText}>+ UPLOAD AUDIO</Text>
      </TouchableOpacity>

      {tracksOpen && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 28 }}>
          {trackKeys.map((k) => {
            const active = k === trackKey;
            const user = isUserTrack(k);

            const label = user ? getTrackLabel(k) : (BUILTIN_LABELS[k] ?? k);

            return (
              <View key={k} style={styles.trackRow}>
                <TouchableOpacity
                  style={[styles.trackBtn, active && styles.trackBtnActive]}
                  onPress={() => setTrackKey(k)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.trackText, active && styles.trackTextActive]}>
                    {label} {active ? "✓" : ""}
                  </Text>

                  {user && <Text style={styles.userTag}>UPLOADED</Text>}
                </TouchableOpacity>

                {/* ✅ Remove only for uploaded tracks */}
                {user && (
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => onRemoveUserTrack(k)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.removeBtnText}>REMOVE</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", padding: 22, paddingTop: 60 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  title: { color: "white", fontSize: 26, fontWeight: "900" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },

  closeBtn: { backgroundColor: "rgba(255,255,255,0.1)", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
  closeText: { color: "white", fontWeight: "900", fontSize: 12 },

  muteBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  muteBtnActive: { backgroundColor: "rgba(255,0,0,0.18)", borderColor: "rgba(255,0,0,0.7)" },
  muteIcon: { fontSize: 16 },

  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  label: { color: "white", fontSize: 16, fontWeight: "800" },

  subtitle: { color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: "800", marginTop: 18, marginBottom: 10 },

  pill: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1 },
  pillOn: { borderColor: "rgba(188,255,0,0.8)", backgroundColor: "rgba(188,255,0,0.15)" },
  pillOff: { borderColor: "rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.08)" },
  pillText: { color: "white", fontWeight: "900" },

  sliderBlock: { marginBottom: 10 },
  sliderLabel: { color: "rgba(255,255,255,0.8)", fontWeight: "800", marginBottom: 6, fontSize: 12 },
  slider: { width: "100%", height: 34 },

  tracksHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  currentTrack: { color: "rgba(255,255,255,0.65)", fontWeight: "800", marginTop: -6 },

  toggleBtn: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  toggleBtnText: { color: "white", fontWeight: "900", fontSize: 12 },

  uploadBtn: {
    marginTop: 8,
    backgroundColor: "rgba(0,240,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(0,240,255,0.35)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  uploadBtnText: { color: "white", fontWeight: "900", fontSize: 12, textAlign: "center" },

  trackRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },

  trackBtn: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  trackBtnActive: { backgroundColor: "rgba(0,240,255,0.12)", borderColor: "rgba(0,240,255,0.55)" },
  trackText: { color: "white", fontWeight: "800", fontSize: 16 },
  trackTextActive: { color: "white" },

  userTag: {
    marginTop: 6,
    color: "rgba(255,255,255,0.55)",
    fontWeight: "900",
    fontSize: 10,
  },

  removeBtn: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,0,0,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,0,0,0.30)",
  },
  removeBtnText: { color: "white", fontWeight: "900", fontSize: 11 },
});
