let dirtyPools = new Set();

function addDirtyPool(poolAddress) {
    dirtyPools.add(poolAddress);
}

function getDirtyPools() {
    return Array.from(dirtyPools);
}

function clearDirtyPools() {
    dirtyPools.clear();
}

module.exports = {
    addDirtyPool,
    getDirtyPools,
    clearDirtyPools,
};