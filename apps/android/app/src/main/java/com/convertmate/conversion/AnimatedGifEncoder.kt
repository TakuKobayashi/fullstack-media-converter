package com.convertmate.conversion

import android.graphics.Bitmap
import java.io.OutputStream

/**
 * Pure-Kotlin animated GIF encoder (NeuQuant quantizer).
 * No external dependencies. Ported from Kevin Weiner's Java GIF encoder.
 */
class AnimatedGifEncoder {
    private var delay = 0
    private var repeat = -1
    private var quality = 10
    private lateinit var out: OutputStream
    private var firstFrame = true
    private var width = 0
    private var height = 0

    fun setDelay(ms: Int) { delay = ms / 10 }
    fun setRepeat(count: Int) { repeat = count }
    fun setQuality(q: Int) { quality = q.coerceIn(1, 30) }

    fun start(stream: OutputStream): Boolean {
        out = stream
        writeString("GIF89a")
        return true
    }

    fun addFrame(bitmap: Bitmap): Boolean {
        width  = bitmap.width
        height = bitmap.height
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

        // Quantize
        val nq = NeuQuant(rgbFromArgb(pixels), quality)
        val colorTable = nq.process()
        val indexedPixels = ByteArray(width * height) { i ->
            nq.map(
                (pixels[i] shr 16) and 0xFF,
                (pixels[i] shr 8)  and 0xFF,
                pixels[i] and 0xFF
            ).toByte()
        }

        if (firstFrame) {
            writeLSD()
            writePalette(colorTable)
            if (repeat >= 0) writeNetscapeExt()
        }
        writeGraphicCtrlExt()
        writeImageDesc(firstFrame)
        if (!firstFrame) writePalette(colorTable)
        writePixels(indexedPixels)
        firstFrame = false
        return true
    }

    fun finish(): Boolean {
        out.write(0x3B) // GIF trailer
        out.flush()
        return true
    }

    private fun rgbFromArgb(argb: IntArray): ByteArray {
        val rgb = ByteArray(argb.size * 3)
        for (i in argb.indices) {
            rgb[i * 3]     = ((argb[i] shr 16) and 0xFF).toByte()
            rgb[i * 3 + 1] = ((argb[i] shr 8)  and 0xFF).toByte()
            rgb[i * 3 + 2] = (argb[i] and 0xFF).toByte()
        }
        return rgb
    }

    private fun writeLSD() {
        writeShort(width); writeShort(height)
        out.write(0xF7); out.write(0); out.write(0)
    }

    private fun writePalette(colorTable: ByteArray) {
        out.write(colorTable)
        val pad = 768 - colorTable.size
        repeat(pad) { out.write(0) }
    }

    private fun writeNetscapeExt() {
        out.write(0x21); out.write(0xFF); out.write(11)
        writeString("NETSCAPE2.0")
        out.write(3); out.write(1)
        writeShort(repeat); out.write(0)
    }

    private fun writeGraphicCtrlExt() {
        out.write(0x21); out.write(0xF9); out.write(4)
        out.write(0); writeShort(delay); out.write(0); out.write(0)
    }

    private fun writeImageDesc(first: Boolean) {
        out.write(0x2C)
        writeShort(0); writeShort(0); writeShort(width); writeShort(height)
        out.write(if (first) 0 else 0x80 or 7)
    }

    private fun writePixels(indexed: ByteArray) {
        LZWEncoder(width, height, indexed, 8).encode(out)
    }

    private fun writeShort(v: Int) { out.write(v and 0xFF); out.write((v shr 8) and 0xFF) }
    private fun writeString(s: String) { s.forEach { out.write(it.code) } }
}

// ── NeuQuant color quantizer ─────────────────────────────────────────
private class NeuQuant(private val pixels: ByteArray, private val samplefac: Int) {
    private val netsize = 256
    private val network = Array(netsize) { i -> DoubleArray(4).also { a -> a[0] = (i shl (16 + 3)) / netsize.toDouble(); a[1] = a[0]; a[2] = a[0]; a[3] = i.toDouble() } }
    private val netindex = IntArray(256)
    private val bias = IntArray(netsize)
    private val freq = IntArray(netsize) { (1 shl 16) / netsize }
    private val radpower = IntArray(32)

    fun process(): ByteArray {
        learn(); unbiasnet(); inxbuild()
        return colorMap()
    }

    fun map(r: Int, g: Int, b: Int): Int {
        var bestd = Int.MAX_VALUE; var best = -1
        var i = netindex[g]; var j = i - 1
        while (i < netsize || j >= 0) {
            if (i < netsize) {
                val n = network[i]
                val dist = Math.abs(n[1].toInt() - g).let { it + Math.abs(n[0].toInt() - b) + Math.abs(n[2].toInt() - r) }
                if (dist < bestd) { bestd = dist; best = n[3].toInt() }
                if (dist - (n[1].toInt() - g).let { it * it } > bestd) i = netsize
                else i++
            }
            if (j >= 0) {
                val n = network[j]
                val dist = Math.abs(n[1].toInt() - g).let { it + Math.abs(n[0].toInt() - b) + Math.abs(n[2].toInt() - r) }
                if (dist < bestd) { bestd = dist; best = n[3].toInt() }
                if (dist - (g - n[1].toInt()).let { it * it } > bestd) j = -1
                else j--
            }
        }
        return best
    }

    private fun colorMap(): ByteArray {
        val map = ByteArray(3 * netsize)
        for (i in 0 until netsize) {
            map[i * 3]     = network[i][0].toInt().coerceIn(0, 255).toByte()
            map[i * 3 + 1] = network[i][1].toInt().coerceIn(0, 255).toByte()
            map[i * 3 + 2] = network[i][2].toInt().coerceIn(0, 255).toByte()
        }
        return map
    }

    private fun learn() {
        val alphadec = 30 + (samplefac - 1) / 3
        val pixlen = pixels.size / 3
        var samplepixels = pixlen / samplefac
        var alpha = (1 shl 16); var radius = (netsize shr 3) shl 6; var rad = radius shr 6
        if (rad > 1) for (i in 0 until rad) radpower[i] = (alpha * ((rad * rad - i * i) * (1 shl 8)) / (rad * rad)).toInt()
        val step = if (pixlen % 499 != 0) 3 * 499 else if (pixlen % 491 != 0) 3 * 491 else 3 * 487
        var pix = 0
        repeat(samplepixels) {
            val b = (pixels[pix].toInt() and 0xFF) shl 4
            val g = (pixels[pix + 1].toInt() and 0xFF) shl 4
            val r = (pixels[pix + 2].toInt() and 0xFF) shl 4
            val j = contest(b, g, r)
            altersingle(alpha, j, b, g, r)
            if (rad != 0) alterneigh(rad, j, b, g, r)
            pix += step; if (pix >= pixlen * 3) pix -= pixlen * 3
            if (it % alphadec == 0) { alpha -= alpha / 1024; radius -= radius / 30; rad = radius shr 6; if (rad > 1) for (k in 0 until rad) radpower[k] = (alpha * ((rad * rad - k * k) * (1 shl 8)) / (rad * rad)).toInt() }
        }
    }

    private fun contest(b: Int, g: Int, r: Int): Int {
        var bestd = Int.MAX_VALUE; var bestbiasd = bestd; var bestpos = -1; var bestbiaspos = bestpos
        for (i in 0 until netsize) {
            val n = network[i]
            val dist = Math.abs(n[0].toInt() - b) + Math.abs(n[1].toInt() - g) + Math.abs(n[2].toInt() - r)
            if (dist < bestd) { bestd = dist; bestpos = i }
            val biasdist = dist - (bias[i] shr (16 + 8 - 3))
            if (biasdist < bestbiasd) { bestbiasd = biasdist; bestbiaspos = i }
            bias[i] += freq[i] shr 3; freq[i] -= freq[i] shr 6
        }
        freq[bestpos] += (1 shl 16) / netsize; bias[bestpos] -= (1 shl 16)
        return bestbiaspos
    }

    private fun altersingle(alpha: Int, i: Int, b: Int, g: Int, r: Int) {
        network[i][0] -= (alpha * (network[i][0] - b)) / (1 shl 16)
        network[i][1] -= (alpha * (network[i][1] - g)) / (1 shl 16)
        network[i][2] -= (alpha * (network[i][2] - r)) / (1 shl 16)
    }

    private fun alterneigh(rad: Int, i: Int, b: Int, g: Int, r: Int) {
        val lo = maxOf(i - rad, 0); val hi = minOf(i + rad, netsize - 1)
        var j = i + 1; var k = i - 1; var q = 0
        while (j <= hi || k >= lo) {
            val a = radpower[++q]
            if (j <= hi) { network[j][0] -= a * (network[j][0] - b) / (1 shl 24); network[j][1] -= a * (network[j][1] - g) / (1 shl 24); network[j][2] -= a * (network[j][2] - r) / (1 shl 24); j++ }
            if (k >= lo) { network[k][0] -= a * (network[k][0] - b) / (1 shl 24); network[k][1] -= a * (network[k][1] - g) / (1 shl 24); network[k][2] -= a * (network[k][2] - r) / (1 shl 24); k-- }
        }
    }

    private fun unbiasnet() { for (i in 0 until netsize) { network[i][0] /= 16; network[i][1] /= 16; network[i][2] /= 16; network[i][3] = i.toDouble() } }
    private fun inxbuild() {
        var previouscol = 0; var startpos = 0
        for (i in 0 until netsize) {
            var smallpos = i; var smallval = network[i][1].toInt()
            for (j in i + 1 until netsize) if (network[j][1].toInt() < smallval) { smallpos = j; smallval = network[j][1].toInt() }
            if (i != smallpos) { val t = network[i]; network[i] = network[smallpos]; network[smallpos] = t }
            if (smallval != previouscol) { netindex[previouscol] = (startpos + i) shr 1; for (j in previouscol + 1 until smallval) netindex[j] = i; previouscol = smallval; startpos = i }
        }
        netindex[previouscol] = (startpos + 255) shr 1; for (j in previouscol + 1..255) netindex[j] = 255
    }
}

// ── LZW Encoder ──────────────────────────────────────────────────────
private class LZWEncoder(
    private val width: Int, private val height: Int,
    private val pixels: ByteArray, initCodeSize: Int,
) {
    private val EOF = -1
    private val MAXCODE = { n: Int -> (1 shl n) - 1 }
    private val initCodeSize = maxOf(2, initCodeSize)
    private var n_bits = 0; private var maxcode = 0
    private val htab = IntArray(5003); private val codetab = IntArray(5003)
    private var freeEnt = 0; private var clearFlag = false
    private var cur_accum = 0; private var cur_bits = 0
    private val masks = intArrayOf(0,1,3,7,15,31,63,127,255,511,1023,2047,4095,8191,16383,32767,65535)
    private val accum = ByteArray(256); private var a_count = 0
    private var remaining = width * height; private var curPixel = 0

    fun encode(os: OutputStream) {
        os.write(initCodeSize)
        remaining = width * height; curPixel = 0
        compress(initCodeSize + 1, os)
        os.write(0)
    }

    private fun compress(initBits: Int, outs: OutputStream) {
        var g_init_bits = initBits; n_bits = g_init_bits
        val clearCode = 1 shl (g_init_bits - 1); val eofCode = clearCode + 1
        freeEnt = clearCode + 2; clearFlag = false; maxcode = MAXCODE(n_bits)
        var ent = nextPixel()
        var hshift = 0; var fcode = 5003; while (fcode < 65536) { fshift++; fcode *= 2 }; hshift = 8 - hshift
        htab.fill(-1); output(clearCode, outs)
        outer@ while (true) {
            val c = nextPixel(); if (c == EOF) break
            val fcode2 = (c shl 12) + ent; var i = (c shl hshift) xor ent
            if (htab[i] == fcode2) { ent = codetab[i]; continue }
            if (htab[i] >= 0) {
                var disp = 5003 - i; if (i == 0) disp = 1
                do { i -= disp; if (i < 0) i += 5003; if (htab[i] == fcode2) { ent = codetab[i]; continue@outer } } while (htab[i] >= 0)
            }
            output(ent, outs); ent = c
            if (freeEnt < 4096) { codetab[i] = freeEnt++; htab[i] = fcode2 }
            else { htab.fill(-1); freeEnt = clearCode + 2; clearFlag = true; output(clearCode, outs) }
        }
        output(ent, outs); output(eofCode, outs)
    }

    private fun nextPixel(): Int {
        if (remaining == 0) return EOF
        remaining--
        return pixels[curPixel++].toInt() and 0xFF
    }

    private fun output(code: Int, outs: OutputStream) {
        cur_accum = cur_accum and masks[cur_bits]; cur_accum = if (cur_bits > 0) cur_accum or (code shl cur_bits) else code; cur_bits += n_bits
        while (cur_bits >= 8) { charOut((cur_accum and 0xFF).toByte(), outs); cur_accum = cur_accum shr 8; cur_bits -= 8 }
        if (freeEnt > maxcode || clearFlag) { if (clearFlag) { maxcode = MAXCODE(n_bits.also { n_bits = 2 + 1 }); clearFlag = false } else { n_bits++; maxcode = if (n_bits == 12) 4096 else MAXCODE(n_bits) } }
        if (code == 257 /* eof */) { while (cur_bits > 0) { charOut((cur_accum and 0xFF).toByte(), outs); cur_accum = cur_accum shr 8; cur_bits -= 8 }; flushChar(outs) }
    }

    private fun charOut(c: Byte, outs: OutputStream) { accum[a_count++] = c; if (a_count >= 254) flushChar(outs) }
    private fun flushChar(outs: OutputStream) { if (a_count > 0) { outs.write(a_count); outs.write(accum, 0, a_count); a_count = 0 } }
}
