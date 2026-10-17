; PRINT2: prints R0, from 0 to 99, in decimal. R0 is preserved too.
PRINT2  ST    R0, SAVE_R0
        ST    R1, SAVE_R1
        ST    R2, SAVE_R2
        AND   R1, R1, #0    ; R1 counts the tens
TENS    ADD   R0, R0, #-10
        BRn   ONES
        ADD   R1, R1, #1
        BR    TENS
ONES    ADD   R2, R0, #10   ; R2 <- the ones digit
        ADD   R1, R1, #0
        BRz   LAST          ; no leading zero
        LD    R0, ZERO
        ADD   R0, R0, R1
        OUT
LAST    LD    R0, ZERO
        ADD   R0, R0, R2
        OUT
        LD    R0, SAVE_R0
        LD    R1, SAVE_R1
        LD    R2, SAVE_R2
        RET

ZERO    .FILL x30           ; ASCII '0'
SAVE_R0 .BLKW #1
SAVE_R1 .BLKW #1
SAVE_R2 .BLKW #1
        .END
