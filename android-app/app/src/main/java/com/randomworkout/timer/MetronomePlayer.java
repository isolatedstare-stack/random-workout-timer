package com.randomworkout.timer;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;

/**
 * Streams a click track through Android AudioTrack instead of relying on device-
 * specific static-buffer loop-point support. The worker's blocking writes are
 * paced by the native audio device, not by WebView or JavaScript timers.
 */
final class MetronomePlayer {
    interface Listener { void onState(boolean started, String detail); }

    private static final int SAMPLE_RATE = 48000;
    private static final float NORMAL_VOLUME = 0.90f;
    private static final float DUCK_VOLUME = NORMAL_VOLUME * 0.20f;
    private volatile AudioTrack track;
    private volatile Thread worker;
    private volatile boolean ducked;
    private volatile int generation;

    synchronized boolean start(int bpm, Listener listener) {
        stop();
        if (bpm < 20 || bpm > 300) {
            listener.onState(false, "BPM must be between 20 and 300.");
            return false;
        }
        int token = ++generation;
        ducked = false;
        Thread next = new Thread(() -> runAudio(bpm, token, listener), "WorkoutMetronome");
        next.setDaemon(true);
        worker = next;
        next.start();
        return true;
    }

    private void runAudio(int bpm, int token, Listener listener) {
        AudioTrack output = null;
        try {
            int minBytes = AudioTrack.getMinBufferSize(SAMPLE_RATE,
                    AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
            if (minBytes <= 0) throw new IllegalStateException("Audio output does not support 48 kHz PCM.");
            output = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build())
                    .setAudioFormat(new AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(SAMPLE_RATE)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build())
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .setBufferSizeInBytes(Math.max(minBytes, 16384))
                    .build();
            if (output.getState() != AudioTrack.STATE_INITIALIZED)
                throw new IllegalStateException("Android could not initialize the audio stream.");
            if (token != generation) return;
            track = output;
            output.setVolume(ducked ? DUCK_VOLUME : NORMAL_VOLUME);

            int beatFrames = (int) Math.round(SAMPLE_RATE * 60.0 / bpm);
            int clickFrames = Math.min(beatFrames, SAMPLE_RATE / 10);
            short[] click = new short[clickFrames];
            for (int i = 0; i < clickFrames; i++) {
                double seconds = i / (double) SAMPLE_RATE;
                double attack = Math.min(1.0, i / (SAMPLE_RATE * 0.0015));
                double envelope = attack * Math.exp(-seconds * 35.0);
                double wave = Math.sin(2.0 * Math.PI * 1020.0 * seconds)
                        + 0.23 * Math.sin(2.0 * Math.PI * 1610.0 * seconds);
                int value = (int) Math.round(32767.0 * 0.72 * envelope * wave);
                click[i] = (short) Math.max(-32768, Math.min(32767, value));
            }
            short[] block = new short[2048];
            long frame = 0;
            output.play();
            if (token == generation) listener.onState(true, "Metronome audio stream started at " + bpm + " BPM.");
            while (token == generation && !Thread.currentThread().isInterrupted()) {
                for (int i = 0; i < block.length; i++, frame++) {
                    int beatPosition = (int) (frame % beatFrames);
                    block[i] = beatPosition < clickFrames ? click[beatPosition] : 0;
                }
                int written = output.write(block, 0, block.length, AudioTrack.WRITE_BLOCKING);
                if (written < 0) throw new IllegalStateException("Audio write failed (" + written + ").");
                if (written == 0) Thread.yield();
            }
        } catch (Exception ex) {
            if (token == generation) listener.onState(false,
                    "Metronome audio failed: " + ex.getClass().getSimpleName() + " — " + ex.getMessage());
        } finally {
            if (track == output) track = null;
            if (output != null) {
                try { output.pause(); } catch (Exception ignored) { }
                try { output.flush(); } catch (Exception ignored) { }
                try { output.release(); } catch (Exception ignored) { }
            }
        }
    }

    void setDucked(boolean enabled) {
        ducked = enabled;
        AudioTrack current = track;
        if (current != null) {
            try { current.setVolume(ducked ? DUCK_VOLUME : NORMAL_VOLUME); }
            catch (Exception ignored) { }
        }
    }

    synchronized void stop() {
        generation++;
        Thread oldWorker = worker;
        worker = null;
        AudioTrack oldTrack = track;
        track = null;
        if (oldTrack != null) {
            try { oldTrack.stop(); } catch (Exception ignored) { }
        }
        if (oldWorker != null) oldWorker.interrupt();
    }
}
