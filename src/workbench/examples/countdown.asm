; Counts down from 5 and prints each digit.
        .ORIG x3000
        LD    R1, COUNT     ; R1 <- 5
        LD    R2, ASCII     ; R2 <- '0'
LOOP    ADD   R0, R1, R2    ; R0 <- the digit as a character
        OUT                 ; print R0
        ADD   R1, R1, #-1
        BRp   LOOP
        HALT
COUNT   .FILL #5
ASCII   .FILL x30
        .END
