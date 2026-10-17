; MUL: R0 <- R0 * R1, for R1 >= 0. Adds R0 to itself R1 times.
; It calls nothing, so R7 stays as the caller left it.
MUL     ST    R1, SAVE_R1
        ST    R2, SAVE_R2
        AND   R2, R2, #0    ; R2 sums the product
        ADD   R1, R1, #0
        BRz   DONE
AGAIN   ADD   R2, R2, R0
        ADD   R1, R1, #-1
        BRp   AGAIN
DONE    ADD   R0, R2, #0    ; the result goes in R0
        LD    R1, SAVE_R1
        LD    R2, SAVE_R2
        RET

SAVE_R1 .BLKW #1
SAVE_R2 .BLKW #1
        .END
