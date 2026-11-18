package com.miston.messenger;

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

    @Override
    @SuppressWarnings("deprecation")
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
