package com.miston.messenger;

import android.os.Build;
import android.os.Bundle;
import android.view.DisplayCutout;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String ANDROID_BACK_SCRIPT =
            "(function() {" +
            "var e = new CustomEvent('miston:android-back', { cancelable: true });" +
            "window.dispatchEvent(e);" +
            "return e.defaultPrevented ? 1 : 0;" +
            "})()";

    private int safeTopPx = 0;
    private int safeBottomPx = 0;
    private boolean safeAreaApplied = false;
    private boolean safeAreaBridgeAdded = false;

    private class SafeAreaBridge {
        @JavascriptInterface
        public int top() { return safeTopPx; }

        @JavascriptInterface
        public int bottom() { return safeBottomPx; }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Малюємо під вирізом камери, але реальний відступ для контенту
        // повертаємо окремо: частина WebView не віддає env(safe-area-inset-*).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            WindowManager.LayoutParams params = getWindow().getAttributes();
            params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(params);
        }
        addSafeAreaBridge();
        View decor = getWindow().getDecorView();
        decor.getViewTreeObserver().addOnGlobalLayoutListener(this::measureSafeArea);
        decor.post(this::measureSafeArea);
    }

    @Override
    public void onResume() {
        super.onResume();
        addSafeAreaBridge();
        getWindow().getDecorView().post(this::measureSafeArea);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            addSafeAreaBridge();
            getWindow().getDecorView().post(this::measureSafeArea);
        }
    }

    private void addSafeAreaBridge() {
        if (safeAreaBridgeAdded) return;
        Bridge bridge = getBridge();
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) return;
        webView.addJavascriptInterface(new SafeAreaBridge(), "MistonNative");
        safeAreaBridgeAdded = true;
    }

    @SuppressWarnings("deprecation")
    private void measureSafeArea() {
        View decor = getWindow().getDecorView();
        WindowInsets insets = decor.getRootWindowInsets();
        int top = 0;
        int bottom = 0;
        if (insets != null) {
            top = insets.getSystemWindowInsetTop();
            bottom = insets.getSystemWindowInsetBottom();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                DisplayCutout cutout = insets.getDisplayCutout();
                if (cutout != null) {
                    top = Math.max(top, cutout.getSafeInsetTop());
                    bottom = Math.max(bottom, cutout.getSafeInsetBottom());
                }
            }
        }
        top = Math.max(0, top);
        bottom = Math.max(0, bottom);
        if (safeAreaApplied && top == safeTopPx && bottom == safeBottomPx) return;
        safeTopPx = top;
        safeBottomPx = bottom;
        safeAreaApplied = true;
        applySafeAreaCss();
    }

    private void applySafeAreaCss() {
        Bridge bridge = getBridge();
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) return;
        String script = "(function(){var s=document.documentElement.style;" +
                "s.setProperty('--miston-safe-top','" + safeTopPx + "px');" +
                "s.setProperty('--miston-safe-bottom','" + safeBottomPx + "px');" +
                "})();";
        webView.evaluateJavascript(script, null);
    }

    @Override
    public void onBackPressed() {
        Bridge bridge = getBridge();
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) {
            leaveApp();
            return;
        }
        // JS вирішує, чи є куди повернутися всередині месенджера. Якщо ні —
        // згортаємо застосунок, не перезаписуючи WebView history Capacitor.
        webView.evaluateJavascript(ANDROID_BACK_SCRIPT, value -> {
            if (!"1".equals(value)) runOnUiThread(this::leaveApp);
        });
    }

    private void leaveApp() {
        moveTaskToBack(true);
    }
}
