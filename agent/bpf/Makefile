CLANG ?= clang
ARCH_INCLUDES ?= -I/usr/include/$(shell uname -m)-linux-gnu
BPF_CFLAGS ?= -O2 -g -target bpf -D__TARGET_ARCH_x86 -Wall -Werror $(ARCH_INCLUDES)

.PHONY: all clean

all: build/ct_selector.bpf.o

build/ct_selector.bpf.o: ct_selector.bpf.c
	mkdir -p build
	$(CLANG) $(BPF_CFLAGS) -c $< -o $@

clean:
	rm -rf build
