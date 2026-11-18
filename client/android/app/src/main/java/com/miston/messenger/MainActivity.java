package com.miston.messenger;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Дозволяємо WebView малювати під вирізом камери. Подальший відступ
        // задається CSS env(safe-area-inset-top), тому шапка не ховається під камерою.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            WindowManager.LayoutParams params = getWindow().getAttributes();
            params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(params);
        }
    }

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
