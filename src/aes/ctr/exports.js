/**
 * AES-CTR exports
 */

function AES_CTR_crypt_bytes ( data, key, nonce ) {
    if ( data === undefined ) throw new SyntaxError("data required");
    if ( key === undefined ) throw new SyntaxError("key required");
    if ( nonce === undefined ) throw new SyntaxError("nonce required");
    return get_AES_CTR_instance( { key: key, nonce: nonce } ).encrypt(data).result;
}

exports.AES_CTR = createSimpleCipherInterface( AES_CTR );
exports.AES_CTR.encrypt = AES_CTR_crypt_bytes;
exports.AES_CTR.decrypt = AES_CTR_crypt_bytes;

exports.AES_CTR.Encrypt =
exports.AES_CTR.Decrypt = createProgressiveCipherInterface( AES_CTR_Crypt );
