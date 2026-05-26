/**
 * Audio Engine - Handles audio context, playback, and buffering.
 * 
 * @module audio
 */

/**
 * Manages audio playback with Web Audio API.
 */
export class AudioEngine {
    /**
     * Create an audio engine.
     * @param {Object} options - Configuration options.
     * @param {number} options.sampleRate - Audio sample rate (default: 44100).
     * @param {number} options.channels - Number of channels (default: 2).
     * @param {Function} options.onVisualizationData - Callback for visualization data.
     */
    constructor(options = {}) {
        this.sampleRate = options.sampleRate || 44100;
        this.channels = options.channels || 2;
        this.onVisualizationData = options.onVisualizationData || (() => {});
        this.onUnderrun = options.onUnderrun || (() => {});

        this.context = null;
        this.analyser = null;
        this.gainNode = null;
        this.queue = [];
        this.playTime = 0;
        this.isPaused = false;
        this.isMuted = false;
        this.volume = 1.0;
        this.maxBufferSeconds = 5;
        this.isInitialized = false;
        this._animationFrame = null;
    }
    
    /**
     * Initialize the audio context and nodes.
     * @returns {boolean} True if initialization succeeded.
     */
    initialize() {
        try {
            this.context = new AudioContext({ sampleRate: this.sampleRate });

            // Create gain node for volume control, honoring any mute set before init
            this.gainNode = this.context.createGain();
            this.gainNode.gain.value = this.isMuted ? 0 : this.volume;
            this.gainNode.connect(this.context.destination);

            // Create analyser for visualization
            this.analyser = this.context.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.connect(this.gainNode);

            // Some browsers (especially Safari) start AudioContext suspended
            // even after a user gesture; explicitly resuming ensures audio flows.
            this.context.resume();

            this.isInitialized = true;
            this._startPump();

            return true;
        } catch (error) {
            console.error('Failed to initialize audio context:', error);
            return false;
        }
    }
    
    /**
     * Set playback volume.
     * @param {number} value - Volume from 0.0 to 1.0.
     */
    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, value));
        if (this.gainNode && !this.isMuted) {
            this.gainNode.gain.value = this.volume;
        }
    }
    
    /**
     * Toggle mute state.
     * @param {boolean} muted - Whether to mute.
     */
    setMuted(muted) {
        this.isMuted = muted;
        if (this.gainNode) {
            this.gainNode.gain.value = muted ? 0 : this.volume;
        }
    }
    
    /**
     * Pause playback, continue buffering.
     */
    pause() {
        this.isPaused = true;
        if (this.context && this.context.state === 'running') {
            this.context.suspend();
        }
    }

    /**
     * Resume playback from buffer.
     */
    resume() {
        this.isPaused = false;
        if (this.context && this.context.state === 'suspended') {
            this.context.resume();
        }
    }
    
    /**
     * Stop playback and reset state.
     */
    stop() {
        this.isPaused = false;
        this.queue = [];
        this.playTime = 0;
        
        if (this._animationFrame) {
            cancelAnimationFrame(this._animationFrame);
            this._animationFrame = null;
        }
        
        if (this.context) {
            this.context.close();
            this.context = null;
        }
        
        this.isInitialized = false;
    }
    
    /**
     * Process incoming audio data.
     * @param {ArrayBuffer} data - Raw PCM audio data.
     */
    processAudioData(data) {
        if (!this.isInitialized) return;

        const pcm = new Int16Array(data);
        const bytesPerSecond = this.sampleRate * this.channels * 2;
        const maxBufferBytes = this.maxBufferSeconds * bytesPerSecond;

        // Apply buffer cap regardless of pause state to prevent unbounded growth
        let currentSize = 0;
        for (const item of this.queue) {
            currentSize += item.byteLength;
        }
        while (currentSize + data.byteLength > maxBufferBytes && this.queue.length > 0) {
            const removed = this.queue.shift();
            currentSize -= removed.byteLength;
        }

        this.queue.push(pcm);
    }
    
    /**
     * Get frequency data for visualization.
     * @returns {Uint8Array|null} Frequency data array.
     */
    getVisualizationData() {
        if (!this.analyser) return null;
        
        const data = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(data);
        return data;
    }
    
    /**
     * Start the audio pump loop.
     * @private
     */
    _startPump() {
        const pump = () => {
            if (!this.isInitialized) return;
            
            this._pump();
            this._animationFrame = requestAnimationFrame(pump);
        };
        pump();
    }
    
    /**
     * Schedule queued audio for playback.
     * @private
     */
    _pump() {
        if (this.isPaused || !this.context) return;
        
        while (this.queue.length > 0) {
            const pcm = this.queue.shift();
            const frames = pcm.length / this.channels;
            const buffer = this.context.createBuffer(this.channels, frames, this.sampleRate);
            
            // Deinterleave stereo PCM
            const left = buffer.getChannelData(0);
            const right = this.channels > 1 ? buffer.getChannelData(1) : null;
            
            for (let i = 0, j = 0; j < frames; j++) {
                left[j] = pcm[i++] / 32768;
                if (right) {
                    right[j] = pcm[i++] / 32768;
                }
            }
            
            const source = this.context.createBufferSource();
            source.buffer = buffer;
            source.connect(this.analyser);
            
            if (this.playTime < this.context.currentTime) {
                this.onUnderrun();
                this.playTime = this.context.currentTime + 0.10;
            }
            
            // Disconnect source after playback completes to prevent memory leak
            source.addEventListener('ended', () => {
                source.disconnect();
            });
            
            source.start(this.playTime);
            this.playTime += buffer.duration;
        }
    }
}
