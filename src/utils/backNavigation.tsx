import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { NavTab } from '../components/layout/Sidebar';

export interface UseBackNavigationOptions {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  selectedParty: any;
  setSelectedParty: (party: any) => void;
  isKioskMode?: boolean;
  openModals: { id: string; close: () => void }[];
}

export function useBackNavigation({
  activeTab,
  setActiveTab,
  selectedParty,
  setSelectedParty,
  isKioskMode = false,
  openModals,
}: UseBackNavigationOptions) {
  // Navigation tab history stack (e.g. ['dashboard', 'parties'])
  const tabHistoryRef = useRef<NavTab[]>(['dashboard']);

  // Visual gesture indicator feedback state
  const [gestureFeedback, setGestureFeedback] = useState<{
    visible: boolean;
    direction: 'left' | 'right';
    label: string;
  }>({
    visible: false,
    direction: 'left',
    label: 'Back',
  });

  // Android double-back exit confirmation toast
  const [exitToastVisible, setExitToastVisible] = useState(false);
  const lastBackPressTimeRef = useRef<number>(0);
  const feedbackTimeoutRef = useRef<any>(null);
  const exitToastTimeoutRef = useRef<any>(null);
  const cooldownRef = useRef<number>(0);

  // Keep references fresh for event listeners on every render
  const stateRef = useRef({
    activeTab,
    selectedParty,
    openModals,
    isKioskMode,
  });

  stateRef.current = {
    activeTab,
    selectedParty,
    openModals,
    isKioskMode,
  };

  // Visual gesture indicator helper
  const showGestureFeedback = useCallback((direction: 'left' | 'right', label: string = 'Back') => {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }
    setGestureFeedback({ visible: true, direction, label });
    feedbackTimeoutRef.current = setTimeout(() => {
      setGestureFeedback((prev) => ({ ...prev, visible: false }));
    }, 750);
  }, []);

  // Main unified back handler:
  // Priority: 1) Close open modal -> 2) Close selected party detail -> 3) Pop tab history -> 4) Root exit check
  const handleGoBack = useCallback((source: 'swipe_left' | 'swipe_right' | 'android_button' | 'browser_popstate' | 'ui_button' = 'ui_button'): boolean => {
    const now = Date.now();
    // 250ms cooldown to avoid accidental double triggers
    if (now - cooldownRef.current < 250) {
      return true;
    }
    cooldownRef.current = now;

    const { activeTab: currentTab, selectedParty: currentParty, openModals: currentModals, isKioskMode: currentKiosk } = stateRef.current;

    // In Kiosk / Customer Showroom mode, prevent unauthorized back navigation
    if (currentKiosk && source !== 'ui_button') {
      return false;
    }

    // 1. Topmost open modal takes highest priority
    if (currentModals && currentModals.length > 0) {
      const topModal = currentModals[currentModals.length - 1];
      if (topModal && typeof topModal.close === 'function') {
        topModal.close();
        showGestureFeedback(source === 'swipe_left' ? 'left' : 'right', 'Closed');
        return true;
      }
    }

    // 2. Selected Party detail view
    if (currentParty) {
      setSelectedParty(null);
      showGestureFeedback(source === 'swipe_left' ? 'left' : 'right', 'Parties');
      return true;
    }

    // 3. Tab Navigation History Stack
    if (tabHistoryRef.current.length > 1) {
      tabHistoryRef.current.pop();
      const prevTab = tabHistoryRef.current[tabHistoryRef.current.length - 1] || 'dashboard';
      setActiveTab(prevTab);
      showGestureFeedback(source === 'swipe_left' ? 'left' : 'right', prevTab.charAt(0).toUpperCase() + prevTab.slice(1));
      return true;
    }

    // 4. If on another tab but history stack was empty, fallback to dashboard
    if (currentTab !== 'dashboard') {
      tabHistoryRef.current = ['dashboard'];
      setActiveTab('dashboard');
      showGestureFeedback(source === 'swipe_left' ? 'left' : 'right', 'Dashboard');
      return true;
    }

    // 5. At Root Screen (Dashboard)
    if (Capacitor.isNativePlatform()) {
      if (now - lastBackPressTimeRef.current < 2500) {
        try {
          CapApp.exitApp();
        } catch (e) {
          console.log('CapApp.exitApp error:', e);
        }
      } else {
        lastBackPressTimeRef.current = now;
        setExitToastVisible(true);
        if (exitToastTimeoutRef.current) clearTimeout(exitToastTimeoutRef.current);
        exitToastTimeoutRef.current = setTimeout(() => {
          setExitToastVisible(false);
        }, 2200);
      }
      return true;
    }

    // In web browser at dashboard root, show brief subtle confirmation
    showGestureFeedback('left', 'At Home');
    return false;
  }, [setActiveTab, setSelectedParty, showGestureFeedback]);

  // Navigate to a new tab and register it in history
  const navigateToTab = useCallback((newTab: NavTab) => {
    const currentTab = stateRef.current.activeTab;
    if (newTab !== currentTab) {
      const lastHistoryTab = tabHistoryRef.current[tabHistoryRef.current.length - 1];
      if (lastHistoryTab !== currentTab) {
        tabHistoryRef.current.push(currentTab);
      }
      if (tabHistoryRef.current[tabHistoryRef.current.length - 1] !== newTab) {
        tabHistoryRef.current.push(newTab);
      }
    }
    setSelectedParty(null);
    setActiveTab(newTab);

    try {
      if (typeof window !== 'undefined' && window.history) {
        window.history.pushState({ tab: newTab }, '', '');
      }
    } catch (_) {}
  }, [setActiveTab, setSelectedParty]);

  // 1. Android Native Back Button & System Edge-Swipe Navigation via @capacitor/app
  useEffect(() => {
    let backListenerHandle: any = null;

    try {
      if (typeof CapApp !== 'undefined' && CapApp.addListener) {
        CapApp.addListener('backButton', () => {
          handleGoBack('android_button');
        })
          .then((handle) => {
            backListenerHandle = handle;
          })
          .catch((err) => {
            console.log('CapApp backButton listener warning:', err);
          });
      }
    } catch (err) {
      console.log('CapApp backButton setup warning:', err);
    }

    return () => {
      try {
        if (backListenerHandle?.remove) {
          backListenerHandle.remove();
        }
      } catch (_) {}
    };
  }, [handleGoBack]);

  // 2. Web Browser History Popstate (for iPhone Safari & Android Chrome)
  useEffect(() => {
    const handlePopState = () => {
      handleGoBack('browser_popstate');
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [handleGoBack]);

  // 3. Screen Touch Swipe Gesture: Intentionally disabled.
  // Native Android OS edge swipe and physical back buttons are cleanly handled by CapApp above.
  // Disabling JavaScript touch listeners ensures horizontal scrolling across Settings tabs,
  // Daybook columns, ledgers, and transaction tables NEVER accidentally triggers back or closes modals.

  // Compute canGoBack directly from current state
  const canGoBack =
    Boolean(selectedParty) ||
    activeTab !== 'dashboard' ||
    (openModals && openModals.length > 0);

  return {
    handleGoBack,
    navigateToTab,
    canGoBack,
    gestureFeedback,
    exitToastVisible,
  };
}

/**
 * Visual Overlay Component that renders:
 * 1. An Android / iOS style floating "← Back" cue pill when a swipe gesture is recognized
 * 2. An Android standard "Press back again to exit" toast at the root screen
 */
export const BackGestureFeedbackOverlay: React.FC<{
  gestureFeedback: { visible: boolean; direction: 'left' | 'right'; label: string };
  exitToastVisible: boolean;
}> = ({ gestureFeedback, exitToastVisible }) => {
  return (
    <>
      {/* Floating Gesture Pill */}
      {gestureFeedback.visible && (
        <div
          className={`fixed top-1/2 -translate-y-1/2 z-[9999] pointer-events-none transition-all duration-200 animate-in fade-in zoom-in-90 ${
            gestureFeedback.direction === 'left' ? 'left-4' : 'right-4'
          }`}
        >
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-900/90 text-white font-bold text-xs shadow-2xl backdrop-blur-md border border-slate-700/60 ring-2 ring-white/20">
            {gestureFeedback.direction === 'right' ? (
              <>
                <ArrowLeft className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span>{gestureFeedback.label || 'Back'}</span>
              </>
            ) : (
              <>
                <span>{gestureFeedback.label || 'Back'}</span>
                <ArrowLeft className="w-4 h-4 text-emerald-400 animate-pulse" />
              </>
            )}
          </div>
        </div>
      )}

      {/* Android Root Double-Back Exit Toast */}
      {exitToastVisible && (
        <div className="fixed bottom-16 sm:bottom-6 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="px-4 py-2 bg-slate-900/95 text-white font-semibold text-xs rounded-xl shadow-2xl border border-slate-700 backdrop-blur-md flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>Press back again to exit app</span>
          </div>
        </div>
      )}
    </>
  );
};
