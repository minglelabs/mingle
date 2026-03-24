#!/usr/bin/env python3
import argparse
import selectors
import signal
import socket
import sys
import threading


stop_event = threading.Event()


def pipe_bidirectional(client: socket.socket, target_host: str, target_port: int) -> None:
    upstream = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    upstream.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        upstream.connect((target_host, target_port))
    except OSError:
        client.close()
        upstream.close()
        return

    client.setblocking(False)
    upstream.setblocking(False)
    selector = selectors.DefaultSelector()
    selector.register(client, selectors.EVENT_READ, upstream)
    selector.register(upstream, selectors.EVENT_READ, client)

    try:
        while not stop_event.is_set():
            events = selector.select(timeout=0.5)
            if not events:
                continue
            for key, _ in events:
                src = key.fileobj
                dst = key.data
                try:
                    data = src.recv(65536)
                except OSError:
                    data = b""
                if not data:
                    return
                try:
                    dst.sendall(data)
                except OSError:
                    return
    finally:
        selector.close()
        try:
            client.close()
        except OSError:
            pass
        try:
            upstream.close()
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
