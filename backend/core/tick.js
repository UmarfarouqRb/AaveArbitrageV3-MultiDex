const { bn } = require('../utils/bigints');

const MIN_TICK = -887272;
const MAX_TICK = 887272;
const MIN_SQRT_RATIO = 4295128739n;
const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;

function getTickAtSqrtRatio(sqrtPriceX96) {
    let ratio = sqrtPriceX96;
    if (ratio < MIN_SQRT_RATIO) ratio = MIN_SQRT_RATIO;
    if (ratio > MAX_SQRT_RATIO) ratio = MAX_SQRT_RATIO;

    let r = ratio * ratio;
    let msb = 0;
    
    let r_temp = r / (2n**128n);
    while (r_temp > 0) {
        msb++;
        r_temp = r_temp / 2n;
    }
    
    let log_2_r = msb;
    let log_sqrt_1_0001_r = (log_2_r - 128) * 255738;
    
    let low = log_sqrt_1_0001_r >> 16;
    let high = low + 1;
    
    while(true){
        let mid = (low + high) / 2;
        let p = 1.0001**mid;
        let s = Math.sqrt(p);
        
        let tick_price = bn(s * (2**96));

        if(tick_price > ratio){
            let prev_tick_price = bn(Math.sqrt(1.0001**(mid - 1)) * (2**96));
            if(prev_tick_price <= ratio){
                return mid -1;
            }
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }
}


module.exports = {
    getTickAtSqrtRatio,
    MIN_TICK,
    MAX_TICK
}