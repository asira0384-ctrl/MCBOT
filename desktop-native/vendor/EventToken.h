#pragma once
#include <stdint.h>
// Windows SDK event-token ABI used by WebView2. MinGW lacks EventToken.h.
typedef struct EventRegistrationToken {
    int64_t value;
} EventRegistrationToken;
