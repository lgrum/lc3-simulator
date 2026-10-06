; Multiplies 6 by 7 in a subroutine and stores the result.
; Step into JSR to follow the call. The product ends up in R2.
        .ORIG x3000
        LD    R0, FIRST
        LD    R1, SECOND
        JSR   MULTIPLY      ; R2 <- R0 * R1
        ST    R2, PRODUCT
        HALT

; MULTIPLY: R2 <- R0 * R1, for R1 >= 0. Counts R1 down to zero.
MULTIPLY AND  R2, R2, #0
        ADD   R1, R1, #0
        BRz   DONE
AGAIN   ADD   R2, R2, R0
        ADD   R1, R1, #-1
        BRp   AGAIN
DONE    RET

FIRST   .FILL #6
SECOND  .FILL #7
PRODUCT .BLKW #1
        .END
