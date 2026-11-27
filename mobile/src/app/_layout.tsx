import Ionicons from "@expo/vector-icons/Ionicons";
import {
  CormorantGaramond_500Medium_Italic,
  CormorantGaramond_600SemiBold,
  CormorantGaramond_700Bold,
} from "@expo-google-fonts/cormorant-garamond";
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from "@expo-google-fonts/manrope";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { AuthProvider, useAuth } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import { CurrencyProvider } from "@/lib/currency";
import { FavoritesProvider } from "@/lib/favorites";
import { askOnFirstLaunch, useNotificationTaps } from "@/lib/notifications";
import { useOtaUpdates } from "@/lib/updates";
import { ApiError } from "@/lib/api";
import { colors, fonts } from "@/theme";

void SplashScreen.preventAutoHideAsync();

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        // 4xx answers are final (not found, forbidden); retry only lost connections and 5xx.
        retry: (count, err) =>
          count < 2 && !(err instanceof ApiError && err.status >= 400 && err.status < 500),
      },
    },
  });
}

export default function RootLayout() {
  const [queryClient] = useState(makeQueryClient);
  const [fontsLoaded, fontError] = useFonts({
    CormorantGaramond_500Medium_Italic,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_700Bold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    ...Ionicons.font,
  });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CurrencyProvider>
          <CartProvider>
            <FavoritesProvider>
              <StatusBar style="dark" />
              {(fontsLoaded || fontError) && <Navigation />}
            </FavoritesProvider>
          </CartProvider>
        </CurrencyProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function Navigation() {
  const { ready } = useAuth();
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);
  // A moment after the first screen shows, the phone asks about order notifications (once).
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => void askOnFirstLaunch(), 1200);
    return () => clearTimeout(timer);
  }, [ready]);
  useNotificationTaps(ready);
  useOtaUpdates();
  if (!ready) return null;

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.cream },
          headerShadowVisible: false,
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: fonts.serif, fontSize: 22 },
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.cream },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "Главная" }} />
        <Stack.Screen name="product/[id]" options={{ title: "" }} />
        {/* «Вы выбрали» after «В корзину»: the system's sheet, as tall as its content. */}
        <Stack.Screen
          name="added"
          options={{
            presentation: "formSheet",
            sheetAllowedDetents: "fitToContents",
            sheetGrabberVisible: true,
            headerShown: false,
            contentStyle: { backgroundColor: colors.cream },
          }}
        />
        <Stack.Screen name="collection" options={{ title: "Каталог" }} />
        <Stack.Screen name="categories" options={{ title: "Категории" }} />
        <Stack.Screen name="brands" options={{ title: "Бренды" }} />
        <Stack.Screen name="checkout" options={{ title: "Оформление" }} />
        <Stack.Screen name="orders/index" options={{ title: "Мои заказы" }} />
        <Stack.Screen name="orders/[id]" options={{ title: "Заказ" }} />
        <Stack.Screen name="profile" options={{ title: "Профиль" }} />
        <Stack.Screen name="change-password" options={{ title: "Смена пароля" }} />
        <Stack.Screen name="wholesale" options={{ title: "Оптовые цены" }} />
        <Stack.Screen name="delete-account" options={{ title: "Удаление аккаунта" }} />
        <Stack.Screen name="login" options={{ title: "Вход", presentation: "modal" }} />
        <Stack.Screen name="register" options={{ title: "Регистрация", presentation: "modal" }} />
        <Stack.Screen
          name="forgot-password"
          options={{ title: "Восстановление", presentation: "modal" }}
        />
      </Stack>
      <WhatsAppButton />
    </View>
  );
}
