package fun.lucc.voicenest;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private boolean serviceWorkersCleared;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(FileDownloadPlugin.class);
        super.onCreate(savedInstanceState);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(getBridge().getWebView(), true);

        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                clearLegacyServiceWorkers(view, url);
            }
        });
    }

    private void clearLegacyServiceWorkers(WebView view, String url) {
        if (serviceWorkersCleared || !url.startsWith("https://localhost")) {
            return;
        }

        serviceWorkersCleared = true;
        view.evaluateJavascript(
            "if ('serviceWorker' in navigator) { navigator.serviceWorker.getRegistrations().then(function(registrations) { if (registrations.length) { Promise.all(registrations.map(function(registration) { return registration.unregister(); })).then(function() { location.reload(); }); } }); }",
            null
        );
    }
}
