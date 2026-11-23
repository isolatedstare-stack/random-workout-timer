package com.randomworkout.timer;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;

/**
 * Plays a sample-accurate metronome using a single repeating PCM buffer.
 * No JavaScript or Java timers are involved in scheduling the beats.
 * All methods are called on the Activity UI thread.
 */
final class MetronomePlayer {
    private static final int SAMPLE_RATE = 44100;
    private static final float NORMAL_VOLUME = 0.72f;
    private static final float DUCK_VOLUME = NORMAL_VOLUME * 0.20f;
    private AudioTrack track;
    private boolean ducked;

    boolean start(int bpm) {
        stop();
        if (bpm < 20 || bpm > 300) return false;
        int beatFrames = (int) Math.round(SAMPLE_RATE * 60.0 / bpm);
        byte[] pcm = new byte[beatFrames * 2];
        int clickFrames = Math.min(beatFrames, (int) (SAMPLE_RATE * 0.070));
        for (int i = 0; i < clickFrames; i++) {
            double seconds = i / (double) SAMPLE_RATE;
            // A short bright tap with a quick attack and smooth exponential decay.
            double attack = Math.min(1.0, i / (SAMPLE_RATE * 0.0025));
            double envelope = attack * Math.exp(-seconds * 62.0);
            double wave = Math.sin(2.0 * Math.PI * 1150.0 * seconds)
                    + 0.22 * Math.sin(2.0 * Math.PI * 1725.0 * seconds);
            int sample = (int) Math.round(32767.0 * 0.66 * envelope * wave);
            sample = Math.max(-32768, Math.min(32767, sample));
            pcm[i * 2] = (byte) sample;
            pcm[i * 2 + 1] = (byte) (sample >>> 8);
        }
        AudioTrack created = null;
        try {
            created = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build())
                    .setAudioFormat(new AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(SAMPLE_RATE)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build())
                    .setTransferMode(AudioTrack.MODE_STATIC)
                    .setBufferSizeInBytes(pcm.length)
                    .build();
            if (created.getState() != AudioTrack.STATE_INITIALIZED) {
                created.release();
                return false;
            }
            int bytesWritten = created.write(pcm, 0, pcm.length);
            if (bytesWritten != pcm.length || created.setLoopPoints(0, beatFrames, -1) != AudioTrack.SUCCESS) {
                created.release();
                return false;
            }
            created.setVolume(NORMAL_VOLUME);
            created.play();
            track = created;
            return true;
        } catch (Exception ex) {
            if (created != null) {
                try { created.release(); } catch (Exception ignored) { }
            }
            return false;
        }
    }

    void setDucked(boolean enabled) {
        ducked = enabled;
        if (track != null) {
            try { track.setVolume(ducked ? DUCK_VOLUME : NORMAL_VOLUME); }
            catch (Exception ignored) { }
        }
    }

    void stop() {
        AudioTrack previous = track;
        track = null;
        ducked = false;
        if (previous != null) {
            try { previous.pause(); } catch (Exception ignored) { }
            try { previous.flush(); } catch (Exception ignored) { }
            try { previous.release(); } catch (Exception ignored) { }
        }
    }
}
