// app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import React from "react";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" }, // hides the Home / Explore bar
      }}
    >
      <Tabs.Screen name="index" options={{ title: "DadBot" }} />

      {/* Hide the Expo template Explore screen if it exists */}
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
