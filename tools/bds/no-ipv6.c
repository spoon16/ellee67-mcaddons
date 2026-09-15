/*
 * Lets Bedrock Dedicated Server start on a machine with no IPv6.
 *
 * The server opens one UDP socket per address family and quits when either fails, which is what happens in a
 * container whose kernel has IPv6 compiled out (socket() returns EAFNOSUPPORT). Preloaded with LD_PRELOAD, this
 * answers every AF_INET6 socket() with an IPv4 socket bound to loopback and swallows the IPv6-only options, so
 * the server sees a healthy but unreachable IPv6 port. tools/bds/setup.ts builds and preloads it only when
 * /proc/net/if_inet6 is missing.
 *
 *   cc -shared -fPIC -O2 -o .bds/no-ipv6.so tools/bds/no-ipv6.c -ldl
 */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <netinet/in.h>
#include <string.h>
#include <sys/socket.h>

static int (*real_socket)(int, int, int);
static int (*real_bind)(int, const struct sockaddr *, socklen_t);
static int (*real_setsockopt)(int, int, int, const void *, socklen_t);
static int (*real_getsockname)(int, struct sockaddr *, socklen_t *);
static int (*real_close)(int);

/* One bit per descriptor: which sockets are IPv4 standing in for IPv6. */
static unsigned char standin[65536 / 8];
static int is_standin(int fd) { return fd >= 0 && fd < 65536 && (standin[fd >> 3] >> (fd & 7)) & 1; }
static void mark(int fd, int on) {
  if (fd < 0 || fd >= 65536) return;
  if (on) standin[fd >> 3] |= (unsigned char)(1 << (fd & 7));
  else standin[fd >> 3] &= (unsigned char)~(1 << (fd & 7));
}

static void resolve(void) {
  if (real_socket) return;
  real_socket = (int (*)(int, int, int))dlsym(RTLD_NEXT, "socket");
  real_bind = (int (*)(int, const struct sockaddr *, socklen_t))dlsym(RTLD_NEXT, "bind");
  real_setsockopt = (int (*)(int, int, int, const void *, socklen_t))dlsym(RTLD_NEXT, "setsockopt");
  real_getsockname = (int (*)(int, struct sockaddr *, socklen_t *))dlsym(RTLD_NEXT, "getsockname");
  real_close = (int (*)(int))dlsym(RTLD_NEXT, "close");
}

int socket(int domain, int type, int protocol) {
  resolve();
  if (domain != AF_INET6) return real_socket(domain, type, protocol);
  int fd = real_socket(AF_INET, type, protocol);
  if (fd >= 0) mark(fd, 1);
  return fd;
}

int bind(int fd, const struct sockaddr *address, socklen_t length) {
  resolve();
  if (!is_standin(fd) || address == NULL || address->sa_family != AF_INET6) return real_bind(fd, address, length);
  const struct sockaddr_in6 *six = (const struct sockaddr_in6 *)address;
  struct sockaddr_in four;
  memset(&four, 0, sizeof four);
  four.sin_family = AF_INET;
  four.sin_port = six->sin6_port;
  four.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  return real_bind(fd, (const struct sockaddr *)&four, sizeof four);
}

int setsockopt(int fd, int level, int name, const void *value, socklen_t length) {
  resolve();
  if (is_standin(fd) && level == IPPROTO_IPV6) return 0;
  return real_setsockopt(fd, level, name, value, length);
}

int getsockname(int fd, struct sockaddr *address, socklen_t *length) {
  resolve();
  if (!is_standin(fd)) return real_getsockname(fd, address, length);
  struct sockaddr_in four;
  socklen_t four_length = sizeof four;
  if (real_getsockname(fd, (struct sockaddr *)&four, &four_length) < 0) return -1;
  struct sockaddr_in6 six;
  memset(&six, 0, sizeof six);
  six.sin6_family = AF_INET6;
  six.sin6_port = four.sin_port;
  six.sin6_addr = in6addr_loopback;
  socklen_t copy = *length < sizeof six ? *length : sizeof six;
  memcpy(address, &six, copy);
  *length = sizeof six;
  return 0;
}

int close(int fd) {
  resolve();
  mark(fd, 0);
  return real_close(fd);
}
