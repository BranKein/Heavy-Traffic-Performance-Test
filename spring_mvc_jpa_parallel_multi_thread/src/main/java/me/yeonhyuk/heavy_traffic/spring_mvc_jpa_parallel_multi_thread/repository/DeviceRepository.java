package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_multi_thread.repository;

import me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_multi_thread.entity.Device;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface DeviceRepository extends JpaRepository<Device, UUID> {

    List<Device> findByUserFkIn(Collection<UUID> userFks);
}
