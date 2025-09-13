function validateSQL(sql) {
    // Very basic safety check to prevent DROP, DELETE, etc.
    const unsafe = /drop|delete|update|insert|alter/i;
    return sql && !unsafe.test(sql);
}

module.exports = { validateSQL };
