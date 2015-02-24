function AES ( options ) {
    this.BLOCK_SIZE = _aes_block_size;

    options = options || {};

    this.heap = _heap_init( Uint8Array, options ).subarray( AES_asm.HEAP_DATA );
    this.asm = options.asm || AES_asm( global, null, this.heap.buffer );
    this.mode = null;
    this.key = null;

    this.reset( options );
}

function AES_set_key ( key ) {
    if ( key !== undefined ) {
        if ( is_buffer(key) || is_bytes(key) ) {
            key = new Uint8Array(key);
        }
        else if ( is_string(key) ) {
            key = string_to_bytes(key);
        }
        else {
            throw new TypeError("unexpected key type");
        }

        var keylen = key.length;
        if ( keylen !== 16 && keylen !== 24 && keylen !== 32 )
            throw new IllegalArgumentError("illegal key size");

        var keyview = new DataView( key.buffer, key.byteOffset, key.byteLength );
        this.asm.set_key(
            keylen >> 2,
            keyview.getUint32(0),
            keyview.getUint32(4),
            keyview.getUint32(8),
            keyview.getUint32(12),
            keylen > 16 ? keyview.getUint32(16) : 0,
            keylen > 16 ? keyview.getUint32(20) : 0,
            keylen > 24 ? keyview.getUint32(24) : 0,
            keylen > 24 ? keyview.getUint32(28) : 0
        );

        this.key = key;
    }
    else if ( !this.key ) {
        throw new Error("key is required");
    }
}

function AES_set_iv ( iv ) {
    if ( iv !== undefined ) {
        if ( is_buffer(iv) || is_bytes(iv) ) {
            iv = new Uint8Array(iv);
        }
        else if ( is_string(iv) ) {
            iv = string_to_bytes(iv);
        }
        else {
            throw new TypeError("unexpected iv type");
        }

        if ( iv.length !== _aes_block_size )
            throw new IllegalArgumentError("illegal iv size");

        var ivview = new DataView( iv.buffer, iv.byteOffset, iv.byteLength );

        this.iv = iv;
        this.asm.set_iv( ivview.getUint32(0), ivview.getUint32(4), ivview.getUint32(8), ivview.getUint32(12) );
    }
    else {
        this.iv = null;
        this.asm.set_iv( 0, 0, 0, 0 );
    }
}

function AES_set_padding ( padding ) {
    if ( padding !== undefined ) {
        this.padding = !!padding;
    }
    else {
        this.padding = true;
    }
}

function AES_reset ( options ) {
    options = options || {};

    this.result = null;
    this.pos = 0;
    this.len = 0;

    AES_set_key.call( this, options.key );
    if ( this.hasOwnProperty('iv') ) AES_set_iv.call( this, options.iv );
    if ( this.hasOwnProperty('padding') ) AES_set_padding.call( this, options.padding );

    return this;
}

function AES_Encrypt_process ( data ) {
    if ( is_string(data) )
        data = string_to_bytes(data);

    if ( is_buffer(data) )
        data = new Uint8Array(data);

    if ( !is_bytes(data) )
        throw new TypeError("data isn't of expected type");

    var asm = this.asm,
        heap = this.heap,
        amode = AES_asm[this.mode+'_ENC'],
        hpos = AES_asm.HEAP_DATA,
        ks = this.key.length >> 2,
        pos = this.pos,
        len = this.len,
        dpos = 0,
        dlen = data.length || 0,
        rpos = 0,
        rlen = _aes_block_size * Math.floor( ( len + dlen ) / _aes_block_size ),
        wlen = 0;

    var result = new Uint8Array(rlen);

    while ( dlen > 0 ) {
        wlen = _heap_write( heap, pos+len, data, dpos, dlen );
        len  += wlen;
        dpos += wlen;
        dlen -= wlen;

        wlen = asm.cipher( ks, amode, hpos + pos, len );

        result.set( heap.subarray( pos, pos + wlen ), rpos );
        rpos += wlen;

        if ( wlen < len ) {
            pos += wlen;
            len -= wlen;
        } else {
            pos = 0;
            len = 0;
        }
    }

    this.result = result;
    this.pos = pos;
    this.len = len;

    return this;
}

function AES_Encrypt_finish ( data ) {
    var presult = null,
        prlen = 0;

    if ( data !== undefined ) {
        presult = AES_Encrypt_process.call( this, data ).result;
        prlen = presult.length;
    }

    var asm = this.asm,
        heap = this.heap,
        amode = AES_asm[this.mode+'_ENC'],
        hpos = AES_asm.HEAP_DATA,
        ks = this.key.length >> 2,
        pos = this.pos,
        len = this.len,
        plen = _aes_block_size - len % _aes_block_size,
        rlen = len;

    if ( this.hasOwnProperty('padding') ) {
        if ( this.padding ) {
            for ( var p = 0; p < plen; ++p ) heap[ pos + len + p ] = plen;
            len += plen;
            rlen = len;
        }
        else if ( len % _aes_block_size ) {
            throw new IllegalArgumentError("data length must be a multiple of " + _aes_block_size);
        }
    }
    else {
        len += plen;
    }

    var result = new Uint8Array( prlen + rlen );

    if ( prlen > 0 ) {
        result.set( presult );
    }

    if ( len > 0 ) {
        asm.cipher( ks, amode, hpos + pos, len );
        result.set( heap.subarray( pos, pos + rlen ), prlen );
    }

    this.result = result;
    this.pos = 0;
    this.len = 0;

    return this;
}

function AES_Decrypt_process ( data ) {
    if ( is_string(data) )
        data = string_to_bytes(data);

    if ( is_buffer(data) )
        data = new Uint8Array(data);

    if ( !is_bytes(data) )
        throw new TypeError("data isn't of expected type");

    var asm = this.asm,
        heap = this.heap,
        amode = AES_asm[this.mode+'_DEC'],
        hpos = AES_asm.HEAP_DATA,
        ks = this.key.length >> 2,
        pos = this.pos,
        len = this.len,
        dpos = 0,
        dlen = data.length || 0,
        rpos = 0,
        rlen = _aes_block_size * Math.floor( ( len + dlen ) / _aes_block_size ),
        plen = 0,
        wlen = 0;

    if ( this.hasOwnProperty('padding') && this.padding ) {
        plen = len + dlen - rlen || _aes_block_size;
        rlen -= plen;
    }

    var result = new Uint8Array(rlen);

    while ( dlen > 0 ) {
        wlen = _heap_write( heap, pos+len, data, dpos, dlen );
        len  += wlen;
        dpos += wlen;
        dlen -= wlen;

        wlen = asm.cipher( ks, amode, hpos + pos, len - ( !dlen ? plen : 0 ) );

        result.set( heap.subarray( pos, pos + wlen ), rpos );
        rpos += wlen;

        if ( wlen < len ) {
            pos += wlen;
            len -= wlen;
        } else {
            pos = 0;
            len = 0;
        }
    }

    this.result = result;
    this.pos = pos;
    this.len = len;

    return this;
}

function AES_Decrypt_finish ( data ) {
    var presult = null,
        prlen = 0;

    if ( data !== undefined ) {
        presult = AES_Decrypt_process.call( this, data ).result;
        prlen = presult.length;
    }

    var asm = this.asm,
        heap = this.heap,
        amode = AES_asm[this.mode+'_DEC'],
        hpos = AES_asm.HEAP_DATA,
        ks = this.key.length >> 2,
        pos = this.pos,
        len = this.len,
        rlen = len;

    if ( len > 0 ) {
        if ( len % _aes_block_size ) {
            if ( this.hasOwnProperty('padding') ) {
                throw new IllegalArgumentError("data length must be a multiple of " + _aes_block_size);
            } else {
                len += _aes_block_size - ( len % _aes_block_size );
            }
        }

        asm.cipher( ks, amode, hpos + pos, len );

        if ( this.hasOwnProperty('padding') && this.padding ) {
            rlen -= heap[ pos + rlen - 1 ]; // FIXME check padding is correct
        }
    }

    var result = new Uint8Array( prlen + rlen );

    if ( prlen > 0 ) {
        result.set( presult );
    }

    if ( rlen > 0 ) {
        result.set( heap.subarray( pos, pos + rlen ), prlen );
    }

    this.result = result;
    this.pos = 0;
    this.len = 0;

    return this;
}

function createLazyInstanceGetter ( Constructor ) {
    var _instance = null;

    return function ( options ) {
        if ( _instance ) return _instance.reset(options);

//        options = options || {};
//        options.heap = options.heap || _aes_heap_instance;
//        options.asm = options.asm || _aes_asm_instance;

        return _instance = new Constructor(options);
    };
};
