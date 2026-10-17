; SQUARE: R0 <- R0 * R0.
; It calls ARITH-MUL, and a call overwrites R7, so it saves R7 first.
; It saves the registers it changes in its own .BLKW area.
        .EXTERNAL ARITH-MUL

SQUARE  ST    R7, SAVE_R7
        ST    R1, SAVE_R1
        ST    R5, SAVE_R5
        ADD   R1, R0, #0    ; MUL multiplies R0 by R1
        LD    R5, MUL_PTR
        JSRR  R5            ; R0 <- R0 * R1
        LD    R1, SAVE_R1
        LD    R5, SAVE_R5
        LD    R7, SAVE_R7
        RET

MUL_PTR .FILL ARITH-MUL
SAVE_R1 .BLKW #1
SAVE_R5 .BLKW #1
SAVE_R7 .BLKW #1
        .END
