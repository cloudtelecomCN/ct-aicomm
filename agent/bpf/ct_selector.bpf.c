#include <linux/bpf.h>
#include <linux/in.h>
#include <linux/pkt_cls.h>
#include <bpf/bpf_endian.h>
#include <bpf/bpf_helpers.h>

struct selector_event {
    __u64 cgroup_id;
    __u64 socket_cookie;
    __u64 timestamp_ns;
    __u64 bytes;
    __u32 destination_ipv4;
    __u16 destination_port;
    __u8 event_type;
    __u8 protocol;
};

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 4096);
    __type(key, __u64);
    __type(value, __u8);
} allowed_cgroups SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 1024);
    __type(key, __u16);
    __type(value, __u8);
} allowed_destination_ports SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_LRU_HASH);
    __uint(max_entries, 65536);
    __type(key, __u64);
    __type(value, struct selector_event);
} selected_sockets SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 1 << 22);
} selector_events SEC(".maps");

static __always_inline void emit_event(const struct selector_event *source)
{
    struct selector_event *event = bpf_ringbuf_reserve(&selector_events, sizeof(*event), 0);
    if (!event)
        return;
    __builtin_memcpy(event, source, sizeof(*event));
    bpf_ringbuf_submit(event, 0);
}

SEC("cgroup/connect4")
int identify_connect4(struct bpf_sock_addr *ctx)
{
    __u64 cgroup_id = bpf_get_current_cgroup_id();
    __u8 *cgroup_allowed = bpf_map_lookup_elem(&allowed_cgroups, &cgroup_id);
    if (!cgroup_allowed || !*cgroup_allowed)
        return 1;

    __u16 destination_port = bpf_ntohs((__u16)ctx->user_port);
    __u8 *port_allowed = bpf_map_lookup_elem(&allowed_destination_ports, &destination_port);
    if (!port_allowed || !*port_allowed)
        return 1;

    __u64 cookie = bpf_get_socket_cookie(ctx);
    if (!cookie)
        return 1;

    struct selector_event event = {
        .cgroup_id = cgroup_id,
        .socket_cookie = cookie,
        .timestamp_ns = bpf_ktime_get_ns(),
        .bytes = 0,
        .destination_ipv4 = ctx->user_ip4,
        .destination_port = destination_port,
        .event_type = 1,
        .protocol = IPPROTO_TCP,
    };
    bpf_map_update_elem(&selected_sockets, &cookie, &event, BPF_ANY);
    emit_event(&event);
    return 1;
}

SEC("tc/egress")
int identify_egress(struct __sk_buff *skb)
{
    __u64 cookie = bpf_get_socket_cookie(skb);
    if (!cookie)
        return TC_ACT_OK;

    struct selector_event *selected = bpf_map_lookup_elem(&selected_sockets, &cookie);
    if (!selected)
        return TC_ACT_OK;

    struct selector_event event = *selected;
    event.timestamp_ns = bpf_ktime_get_ns();
    event.bytes = skb->len;
    event.event_type = 2;
    emit_event(&event);
    return TC_ACT_OK;
}

char LICENSE[] SEC("license") = "GPL";
