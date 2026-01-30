import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const FAVORITES_KEY = "favoriteJokes_v1";

export default function Favorites() {
  const router = useRouter();
  const [favorites, setFavorites] = React.useState<string[]>([]);

  React.useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(FAVORITES_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setFavorites(parsed.filter((x) => typeof x === "string"));
      } catch {}
    })();
  }, []);

  const removeJoke = async (joke: string) => {
    const next = favorites.filter((j) => j !== joke);
    setFavorites(next);
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  };

  const clearAll = async () => {
    setFavorites([]);
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify([]));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Favorites</Text>

        <View style={styles.headerRight}>
          {favorites.length > 0 && (
            <TouchableOpacity style={styles.headerBtn} onPress={clearAll} activeOpacity={0.85}>
              <Text style={styles.headerBtnText}>CLEAR</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={styles.headerBtnText}>CLOSE</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {favorites.length === 0 && (
          <Text style={styles.empty}>No favorite jokes yet 😅</Text>
        )}

        {favorites.map((joke, i) => (
          <View key={`${i}-${joke.slice(0, 10)}`} style={styles.card}>
            <Text style={styles.joke}>{joke}</Text>

            <View style={styles.actions}>
              <TouchableOpacity onPress={() => Share.share({ message: joke })} activeOpacity={0.85}>
                <Text style={styles.action}>SHARE</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => removeJoke(joke)} activeOpacity={0.85}>
                <Text style={[styles.action, styles.remove]}>REMOVE</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", padding: 20, paddingTop: 60 },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  title: { color: "white", fontSize: 26, fontWeight: "900" },
  headerRight: { flexDirection: "row", gap: 10 },

  headerBtn: { backgroundColor: "rgba(255,255,255,0.1)", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
  headerBtnText: { color: "white", fontWeight: "900", fontSize: 12 },

  empty: { color: "rgba(255,255,255,0.6)", textAlign: "center", marginTop: 80 },

  card: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  joke: { color: "white", fontSize: 18, fontWeight: "700", lineHeight: 26 },

  actions: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  action: { color: "#00f0ff", fontWeight: "900", fontSize: 12 },
  remove: { color: "#ff4d9d" },
});
