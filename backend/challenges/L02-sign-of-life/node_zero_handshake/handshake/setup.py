from setuptools import setup

package_name = 'handshake'

setup(
    name=package_name,
    version='0.2.0',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='IEEE RAS NODE ZERO',
    maintainer_email='nodezero@ieeeras.example',
    description='NODE ZERO Stage 2: Unit Zero handshake — wakes on the correct wake word.',
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'handshake_node = handshake.handshake_node:main',
        ],
    },
)
