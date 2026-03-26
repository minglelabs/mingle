#!/usr/bin/env python3
"""Lightweight TCP reverse proxy.

Each connection is handled by two blocking threads (one per direction),
which avoids the non-blocking sendall pitfall that caused unexpected EOF
on large transfers.
"""
import argparse
import signal
import socket
import sys
import threading


stop_event = threading.Event()


def _forward(src: socket.socket, dst: socket.socket) -> None:
    """Copy bytes from src to dst until EOF, then half-close dst."""
    try:
        while True:
            try:
                data = src.recv(65536)
            except OSError:
                break
            if not data:
                break
            try:
                dst.sendall(data)
            except OSError:
                break
    finally:
        # Signal the other side that we are done writing.
        try:
            dst.shutdown(socket.SHUT_WR)
        except OSError:
            pass


def pipe_bidirectional(client: socket.socket, target_host: str, target_port: int) -> None:
    upstream = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    upstream.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    try:
        upstream.connect((target_host, target_port))
    except OSError:
        client.close()
        upstream.close()
        return

    client.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)

    t_up = threading.Thread(target=_forward, args=(client, upstream), daemon=True)
    t_dn = threading.Thread(target=_forward, args=(upstream, client), daemon=True)
    t_up.start()
    t_dn.start()
    t_up.join()
    t_dn.join()

    for sock in (client, upstream):
        try:
            sock.close()
        except OSError:
            pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--listen-host", default="127.0.0.1")
    parser.add_argument("--listen-port", type=int, required=True)
    parser.add_argument("--target-host", default="127.0.0.1")
    parser.add_argument("--target-port", type=int, required=True)
    args = parser.parse_args()

    def handle_signal(_signum, _frame):
        stop_event.set()

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((args.listen_host, args.listen_port))
    server.listen()
    server.settimeout(0.5)

    try:
        while not stop_event.is_set():
            try:
                client, _ = server.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            thread = threading.Thread(
                target=pipe_bidirectional,
                args=(client, args.target_host, args.target_port),
                daemon=True,
            )
            thread.start()
    finally:
        try:
            server.close()
        except OSError:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
