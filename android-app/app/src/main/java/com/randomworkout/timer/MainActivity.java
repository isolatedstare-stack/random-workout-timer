package com.randomworkout.timer;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.speech.tts.UtteranceProgressListener;
import android.view.View;
import android.view.WindowManager;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;
import org.json.JSONArray;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.Locale;

/**
 * Hybrid Android implementation: the timer UI is bundled offline in WebView,
 * but announcements use Android's native TextToSpeech API rather than Web Speech.
 */
public class MainActivity extends Activity {
    private static final String APP_URL = "https://appassets.androidplatform.net/assets/index.html";
    private static final int REQUEST_AUDIO_PERMISSION = 501;
    private static final int REQUEST_AUDIO_FILE = 502;
    private static final int REQUEST_JSON_EXPORT = 503;
    private static final int REQUEST_JSON_IMPORT = 504;
    private static final int MAX_JSON_BYTES = 5_000_000;

    private WebView webView;
    private TextToSpeech tts;
    private volatile boolean ttsReady;
    private boolean ttsFailed;
    private String queuedText;
    private String queuedLanguage;
    private PermissionRequest pendingMicRequest;
    private ValueCallback<Uri[]> fileCallback;
    private String exportJson;
    private MediaPlayer endSoundPlayer;
    private final MetronomePlayer metronomePlayer = new MetronomePlayer();
    private PowerManager.WakeLock sessionWakeLock;
    private volatile String activeUtteranceId;
    private boolean testingMetronome;
    private volatile String preferredVoiceName = "";
    private OnBackInvokedCallback backGestureCallback;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(11, 18, 32));
        getWindow().setNavigationBarColor(Color.rgb(11, 18, 32));
        setupTts();
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        if (power != null) {
            sessionWakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,
                    "RandomWorkoutTimer:ActiveSession");
            sessionWakeLock.setReferenceCounted(false);
        }
        setupWebView();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Android 13+ consumes edge-swipe Back before WebView touch handlers.
            backGestureCallback = this::dispatchBackToWeb;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, backGestureCallback);
        }
    }

    private void dispatchBackToWeb() {
        if (webView != null) {
            webView.evaluateJavascript(
                    "window.onNativeBackRequested && window.onNativeBackRequested()", null);
        }
    }

    @Override
    public void onBackPressed() {
        // Legacy Back button/gesture dispatch (Android 12 and below).
        dispatchBackToWeb();
    }

    private void setupTts() {
        tts = new TextToSpeech(getApplicationContext(), status -> runOnUiThread(() -> {
            if (status != TextToSpeech.SUCCESS || tts == null) {
                ttsFailed = true;
                notifyWeb("error", "Android speech engine failed to initialize. Check your system TTS settings.");
                return;
            }
            ttsReady = true;
            tts.setSpeechRate(1.0f);
            tts.setPitch(1.0f);
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String utteranceId) {
                    runOnUiThread(() -> {
                        if (utteranceId.equals(activeUtteranceId)) {
                            metronomePlayer.setDucked(true);
                            notifyWeb("speaking", "Android voice started");
                        }
                    });
                }
                @Override public void onDone(String utteranceId) {
                    runOnUiThread(() -> {
                        if (utteranceId.equals(activeUtteranceId)) {
                            activeUtteranceId = null;
                            metronomePlayer.setDucked(false);
                            notifyWeb("done", "Android voice completed");
                        }
                    });
                }
                @Override public void onError(String utteranceId) {
                    handleSpeechFailure(utteranceId);
                }
                @Override public void onError(String utteranceId, int errorCode) {
                    handleSpeechFailure(utteranceId);
                }
                @Override public void onStop(String utteranceId, boolean interrupted) {
                    runOnUiThread(() -> {
                        if (utteranceId.equals(activeUtteranceId)) {
                            activeUtteranceId = null;
                            metronomePlayer.setDucked(false);
                        }
                    });
                }
            });
            notifyWeb("ready", "Android native speech engine ready");
            if (queuedText != null) {
                String text = queuedText;
                String language = queuedLanguage;
                queuedText = null;
                queuedLanguage = null;
                speakNow(text, language);
            }
        }));
    }

    private void handleSpeechFailure(String utteranceId) {
        runOnUiThread(() -> {
            if (utteranceId.equals(activeUtteranceId)) {
                activeUtteranceId = null;
                metronomePlayer.setDucked(false);
                notifyWeb("error", "Android TTS could not synthesize this announcement. Try another language in Speech voice.");
            }
        });
    }

    private void setupWebView() {
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(11, 18, 32));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true); // Preserves workouts and IndexedDB audio clips.
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // Needed for user-selected audio imports.
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);

        // This JS bridge is exposed ONLY to the bundled, trusted app content.
        webView.addJavascriptInterface(new AndroidSpeechBridge(), "AndroidSpeech");
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("appassets.androidplatform.net".equals(url.getHost()) && "https".equals(url.getScheme())) {
                    return loader.shouldInterceptRequest(url);
                }
                // Never load remote content into a WebView that has a native JS bridge.
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !APP_URL.equals(request.getUrl().toString());
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!APP_URL.equals(url)) return;
                if (ttsFailed) notifyWeb("error", "Android native speech engine is unavailable");
                else if (ttsReady) notifyWeb("ready", "Android native speech engine ready");
                else notifyWeb("initializing", "Initializing Android speech engine…");
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                                       FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    Intent intent = params.createIntent();
                    startActivityForResult(intent, REQUEST_AUDIO_FILE);
                    return true;
                } catch (Exception ignored) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    return true;
                }
            }
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    boolean ours = "appassets.androidplatform.net".equals(request.getOrigin().getHost());
                    boolean onlyAudio = request.getResources().length == 1
                            && Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
                    if (!ours || !onlyAudio) {
                        request.deny();
                        return;
                    }
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    } else {
                        if (pendingMicRequest != null) pendingMicRequest.deny();
                        pendingMicRequest = request;
                        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_AUDIO_PERMISSION);
                    }
                });
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingMicRequest == request) pendingMicRequest = null;
            }
        });
        webView.loadUrl(APP_URL);
    }

    private class AndroidSpeechBridge {
        @JavascriptInterface public void exitFromSessionsHome() {
            // The WebView asks only after a confirmed Home-screen exit.
            runOnUiThread(() -> finish());
        }
        @JavascriptInterface public void setWorkoutFullscreen(boolean enabled) {
            runOnUiThread(() -> {
                View decor = getWindow().getDecorView();
                if(enabled){
                    decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
                }else{
                    decor.setSystemUiVisibility(0);
                }
            });
        }
        @JavascriptInterface public void setPreferredVoice(String voiceName) {
            preferredVoiceName = voiceName == null ? "" : voiceName;
        }
        @JavascriptInterface public String availableVoices() {
            JSONArray result = new JSONArray();
            if(!ttsReady || tts==null)return result.toString();
            Set<Voice> allVoices = tts.getVoices();
            if(allVoices==null)return result.toString();
            List<Voice> voices=new ArrayList<>();
            for(Voice voice:allVoices)if(!voice.isNetworkConnectionRequired())voices.add(voice);
            voices.sort(Comparator.comparing(v -> v.getLocale().toLanguageTag()+" "+v.getName()));
            for(Voice voice:voices){
                JSONObject entry=new JSONObject();
                try{
                    entry.put("name",voice.getName());
                    entry.put("label",voice.getLocale().getDisplayName()+" — "+voice.getName());
                    entry.put("languageTag",voice.getLocale().toLanguageTag());
                    result.put(entry);
                }catch(Exception ignored){}
            }
            return result.toString();
        }
        @JavascriptInterface public void speak(String text, String languageTag) {
            runOnUiThread(() -> speakNow(text, languageTag));
        }
        @JavascriptInterface public void startAction(String text, String languageTag, boolean useMetronome,
                int bpmStart, int bpmFinish, boolean progressive, long plannedDurationMs, long elapsedMs) {
            runOnUiThread(() -> {
                haltActionAudio();
                if (useMetronome) metronomePlayer.start(bpmStart, bpmFinish, progressive,
                        plannedDurationMs, elapsedMs, (started, detail) -> {
                    notifyWeb(started ? "metronome-started" : "metronome-error", detail);
                });
                speakNow(text, languageTag);
            });
        }
        @JavascriptInterface public void startActionWithRandomBpm(String text, String languageTag,
                boolean useMetronome, int bpmStart, int bpmFinish, String curveCsv,
                long plannedDurationMs, long elapsedMs) {
            runOnUiThread(() -> {
                haltActionAudio();
                if (useMetronome) {
                    try {
                        if (curveCsv == null || curveCsv.isEmpty() || curveCsv.length() > 110000)
                            throw new IllegalArgumentException("Invalid BPM data.");
                        String[] parts = curveCsv.split(",", -1);
                        if (parts.length > 22000)
                            throw new IllegalArgumentException("Tempo curve too long.");
                        int[] curve = new int[parts.length];
                        for (int i = 0; i < parts.length; i++)
                            curve[i] = Integer.parseInt(parts[i]);
                        metronomePlayer.startRandomWalk(bpmStart, bpmFinish, curve,
                                plannedDurationMs, elapsedMs, (started, detail) -> {
                            notifyWeb(started ? "metronome-started" : "metronome-error", detail);
                        });
                    } catch (IllegalArgumentException ex) {
                        notifyWeb("metronome-error", "Invalid random tempo progression.");
                    }
                }
                speakNow(text, languageTag);
            });
        }
        @JavascriptInterface public void testMetronome(int bpm) {
            runOnUiThread(() -> {
                haltActionAudio();
                testingMetronome = true;
                metronomePlayer.start(bpm, (started, detail) -> {
                    notifyWeb(started ? "metronome-test-started" : "metronome-error", detail);
                });
                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                    if (testingMetronome) {
                        testingMetronome = false;
                        metronomePlayer.stop();
                        notifyWeb("metronome-test-ended", "Metronome test finished.");
                    }
                }, 5000);
            });
        }
        @JavascriptInterface public void stop() {
            runOnUiThread(() -> haltActionAudio());
        }
        @JavascriptInterface public void keepScreenOn(boolean enabled) {
            runOnUiThread(() -> {
                if (enabled) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    // CPU stays awake while a workout is actively running with screen locked.
                    // This is released on pause, stop, completion, and Activity destruction.
                    if (sessionWakeLock != null && !sessionWakeLock.isHeld())
                        sessionWakeLock.acquire(8L * 60L * 60L * 1000L);
                } else {
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    releaseSessionWakeLock();
                }
            });
        }
        @JavascriptInterface public void playCompletionSound() {
            runOnUiThread(() -> playEndSound());
        }
        @JavascriptInterface public void exportConfiguration(String json, String fileName) {
            runOnUiThread(() -> {
                // Use Android's document picker so exported backups are visible outside app storage.
                if (json == null || json.length() > 5_000_000) {
                    notifyBackup("error", "Backup is too large to export.");
                    return;
                }
                exportJson = json;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                String safeName = fileName != null && fileName.matches("[a-zA-Z0-9_.-]{1,120}") ? fileName : "random-workout-sessions.json";
                intent.putExtra(Intent.EXTRA_TITLE, safeName);
                try { startActivityForResult(intent, REQUEST_JSON_EXPORT); }
                catch (Exception ex) { exportJson = null; notifyBackup("error", "Could not open the file picker."); }
            });
        }
        @JavascriptInterface public void importConfiguration() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*"); // Some Android file providers mislabel JSON as octet-stream.
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { startActivityForResult(intent, REQUEST_JSON_IMPORT); }
                catch (Exception ex) { notifyImport("error", "Could not open Android's document picker."); }
            });
        }
        @JavascriptInterface public String status() {
            if (ttsFailed) return "failed";
            return ttsReady ? "ready" : "initializing";
        }
    }

    private void notifyImport(String state, String detail) {
        if (webView == null) return;
        String script = "window.onNativeJsonImport && window.onNativeJsonImport("
                + JSONObject.quote(state) + "," + JSONObject.quote(detail) + ");";
        runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }

    private void loadImportedJson(Uri uri) {
        try (InputStream input = getContentResolver().openInputStream(uri)) {
            if (input == null) throw new IllegalStateException("Android returned no readable content for this document.");
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (output.size() + count > MAX_JSON_BYTES)
                    throw new IllegalArgumentException("Backup exceeds the 5 MB limit.");
                output.write(buffer, 0, count);
            }
            if (output.size() == 0) throw new IllegalArgumentException(
                "The selected file is empty (0 bytes). Export a fresh JSON backup from Stage 1.");
            String raw = new String(output.toByteArray(), StandardCharsets.UTF_8);
            if (raw.startsWith("\uFEFF")) raw = raw.substring(1);
            if (raw.trim().isEmpty()) throw new IllegalArgumentException(
                "The selected file contains only whitespace. Export a new backup from Stage 1.");
            // Validate syntax here, then the JavaScript model performs schema checks and asks for confirmation.
            try { new JSONObject(raw); }
            catch (Exception ex) { throw new IllegalArgumentException(
                "This JSON file appears incomplete or invalid (" + output.size() + " bytes). Please check the export."); }
            notifyImport("ok", raw);
        } catch (Exception ex) {
            notifyImport("error", "Import failed: " + ex.getMessage());
        }
    }

    private void playEndSound() {
        try {
            if (endSoundPlayer != null) {
                endSoundPlayer.stop();
                endSoundPlayer.release();
                endSoundPlayer = null;
            }
            endSoundPlayer = MediaPlayer.create(this, R.raw.session_end_bong);
            if (endSoundPlayer != null) {
                endSoundPlayer.setOnCompletionListener(player -> {
                    player.release();
                    if (endSoundPlayer == player) endSoundPlayer = null;
                });
                endSoundPlayer.start();
            }
        } catch (Exception ex) {
            notifyBackup("error", "Could not play the completion chime.");
        }
    }

    private void notifyBackup(String state, String detail) {
        if (webView == null) return;
        String script = "window.onNativeBackupEvent && window.onNativeBackupEvent("
                + JSONObject.quote(state) + "," + JSONObject.quote(detail) + ");";
        runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }

    private void haltActionAudio() {
        testingMetronome = false;
        queuedText = null;
        queuedLanguage = null;
        activeUtteranceId = null;
        if (tts != null && ttsReady) tts.stop();
        metronomePlayer.stop();
    }

    private void releaseSessionWakeLock() {
        if (sessionWakeLock != null && sessionWakeLock.isHeld()) sessionWakeLock.release();
    }

    private void speakNow(String text, String languageTag) {
        if (text == null || text.trim().isEmpty()) return;
        if (ttsFailed) {
            notifyWeb("error", "Native Android TTS is unavailable");
            return;
        }
        if (!ttsReady || tts == null) {
            queuedText = text;
            queuedLanguage = languageTag;
            notifyWeb("initializing", "Speech queued while Android TTS starts");
            return;
        }
        if (languageTag != null && !languageTag.trim().isEmpty() && !"system".equals(languageTag)) {
            Locale locale = Locale.forLanguageTag(languageTag);
            int availability = tts.isLanguageAvailable(locale);
            if (availability >= TextToSpeech.LANG_AVAILABLE) {
                tts.setLanguage(locale);
            } else {
                notifyWeb("fallback", languageTag + " voice is not available; using the current system voice");
            }
        } else {
            // Reset to the user's system default after explicit language selections.
            Locale defaultLocale = Locale.getDefault();
            if (tts.isLanguageAvailable(defaultLocale) >= TextToSpeech.LANG_AVAILABLE) {
                tts.setLanguage(defaultLocale);
            }
        }
        if(!preferredVoiceName.isEmpty()){
            Voice chosen=null;
            Set<Voice> voices=tts.getVoices();
            if(voices!=null)for(Voice voice:voices){
                if(!voice.isNetworkConnectionRequired()&&preferredVoiceName.equals(voice.getName())){
                    chosen=voice;break;
                }
            }
            if(chosen==null || tts.setVoice(chosen)==TextToSpeech.ERROR)
                notifyWeb("voice-unavailable","Selected voice unavailable; Android may use the system voice.");
        }
        String utteranceId = "exercise-" + System.nanoTime();
        activeUtteranceId = utteranceId;
        // Start ducking immediately, even if the voice engine has startup latency.
        metronomePlayer.setDucked(true);
        int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);
        if (result == TextToSpeech.ERROR) {
            activeUtteranceId = null;
            metronomePlayer.setDucked(false);
            notifyWeb("error", "Android TTS rejected this announcement; try a different voice/language");
        }
    }

    private void notifyWeb(String state, String detail) {
        if (webView == null) return;
        String script = "window.onNativeSpeechEvent && window.onNativeSpeechEvent("
                + JSONObject.quote(state) + "," + JSONObject.quote(detail) + ");";
        runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_AUDIO_PERMISSION && pendingMicRequest != null) {
            PermissionRequest request = pendingMicRequest;
            pendingMicRequest = null;
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            } else {
                request.deny();
            }
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_AUDIO_FILE && fileCallback != null) {
            ValueCallback<Uri[]> callback = fileCallback;
            fileCallback = null;
            callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
        }
        if (requestCode == REQUEST_JSON_IMPORT) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                loadImportedJson(data.getData());
            }
            return;
        }
        if (requestCode == REQUEST_JSON_EXPORT) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && exportJson != null) {
                try (OutputStream output = getContentResolver().openOutputStream(data.getData())) {
                    if (output == null) throw new IllegalStateException("No writable stream");
                    output.write(exportJson.getBytes(StandardCharsets.UTF_8));
                    output.flush();
                    notifyBackup("ok", "JSON backup saved successfully.");
                } catch (Exception ex) {
                    notifyBackup("error", "Backup could not be written: " + ex.getMessage());
                }
            }
            exportJson = null;
        }
    }

    @Override protected void onDestroy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && backGestureCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backGestureCallback);
            backGestureCallback = null;
        }
        haltActionAudio();
        releaseSessionWakeLock();
        if (endSoundPlayer != null) { endSoundPlayer.release(); endSoundPlayer = null; }
        if (pendingMicRequest != null) pendingMicRequest.deny();
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
