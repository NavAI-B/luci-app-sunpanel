#!/bin/bash
echo "user=$(whoami)"
echo "sudo=$(sudo -n true 2>/dev/null && echo passwordless || echo needs-password)"
for t in git gcc g++ make python3 unzip rsync zstd curl wget perl tar file ncurses; do
  command -v $t >/dev/null 2>&1 && echo "have:$t" || echo "MISS:$t"
done
dpkg -l build-essential 2>/dev/null | tail -1
