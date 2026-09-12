"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useState } from "react";
import { createLanguageSelectorNavigation } from "./language-selector-navigation";

export function useLanguageSelectorNavigation({
  conversationId,
  isVisible,
}: {
  conversationId?: string;
  isVisible: boolean;
}) {
  const instanceId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const navigation = useMemo(() => createLanguageSelectorNavigation({
    owner: `${conversationId ?? "standalone"}:${instanceId}`,
    history: {
      read: () => window.history.state,
      push: (state) => window.history.pushState(state, ""),
      replace: (state) => window.history.replaceState(state, ""),
      back: () => window.history.back(),
      locationKey: () => window.location.pathname + window.location.search,
    },
    onOpenChange: setIsOpen,
  }), [conversationId, instanceId]);

  useLayoutEffect(() => {
    navigation.setActive(isVisible);
  }, [isVisible, navigation]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      navigation.handlePopState(event.state ?? window.history.state);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      navigation.dispose();
    };
  }, [navigation]);

  return { isOpen: isVisible && isOpen, open: navigation.open, close: navigation.close };
}
